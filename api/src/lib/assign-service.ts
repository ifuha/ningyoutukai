/**
 * タスクの自動割り振りの本体(docs/v3.0/jev-assign.md)。DB を読み書きし、Jev を呼ぶ。
 * - `suggest`: 提案。Jev に聞くだけで、何も書き換えない
 * - `apply`: 確定。担当を付け替える。全件を 1 つのトランザクションで書き、条件を確かめ直す(提案をそのまま信じない)
 * ルートからは、`auto-assign-plugin.ts` のプラグイン経由で呼ぶ。
 */
import { and, asc, count, desc, eq, inArray, isNotNull, isNull, notInArray } from "drizzle-orm";
import { db } from "../db";
import { productMembers, taskTypes, tasks } from "../db/schema";
import {
  buildJevCalls,
  memberAliases,
  planAssignments,
  readScores,
  dueInDays,
  type MemberInfo,
  type TaskInfo,
  type TaskScores,
} from "./auto-assign";
import { assignHooks, type AssignedChange } from "./assign-hooks";
import { JevError, jev } from "./jev";

/** 失敗。ルートが宣言するステータスに合わせて、提案と確定で返す種類を分ける */
export type SuggestError = { ok: false; status: 400 | 404 | 502 | 503; message: string };
export type ApplyError = { ok: false; status: 400 | 404 | 409; message: string };

/** 提案で、割り振りの対象にしたタスクの扱い(決まらなかった理由) */
export type SkipReason = "private" | "low-confidence" | "capacity" | "no-answer";

export type Suggestion = {
  taskId: string;
  taskName: string;
  currentMemberId: string;
  proposedMemberId: string;
  probability: number;
  confidence: number | null;
  /** 今の担当と違うか(同じなら、付け替えも通知も要らない) */
  changed: boolean;
  /** 次点(確率の高い順に最大 2 人。提案したメンバーは含まない) */
  alternatives: { memberId: string; probability: number }[];
};

export type SuggestResult = {
  ok: true;
  model: string;
  inputTokens: number;
  assignments: Suggestion[];
  skipped: { taskId: string; taskName: string; reason: SkipReason }[];
};

export type SuggestOptions = {
  productId: string;
  /** 対象のタスクを指定する。省くと、プロダクトの「作業中」と「差し戻し中」のタスクすべて */
  taskIds?: string[];
  /** 候補から外すメンバー */
  excludeMemberIds?: string[];
  maxPerMember?: number;
  minConfidence?: number;
  now?: Date;
};

/** 既定の対象にする状態。確認待ち(reported)と完了は、担当を変えると混乱するので入れない */
const DEFAULT_TARGET_STATUSES = ["in_progress", "rejected"] as const;
const NO_TARGET = "対象のタスクがありません";

export async function suggest(options: SuggestOptions): Promise<SuggestResult | SuggestError> {
  const { productId } = options;
  const now = options.now ?? new Date();

  const members = await db
    .select({ memberId: productMembers.productMemberId, role: productMembers.role })
    .from(productMembers)
    .where(eq(productMembers.productId, productId))
    .orderBy(asc(productMembers.productMemberId));

  const excluded = new Set(options.excludeMemberIds ?? []);
  const memberIdsInProduct = new Set(members.map((m) => m.memberId));
  if ([...excluded].some((id) => !memberIdsInProduct.has(id))) {
    return { ok: false, status: 400, message: "候補から外すメンバーは、プロダクトのメンバーを指定してください" };
  }
  const candidates = members.filter((m) => !excluded.has(m.memberId));
  if (candidates.length < 2) {
    return { ok: false, status: 400, message: "候補のメンバーが足りません(2 人以上が必要です)" };
  }

  // 対象のタスク(このプロダクトの、未完了のもの)
  const taskIds = options.taskIds ? [...new Set(options.taskIds)] : undefined;
  const rows = await db
    .select({
      taskId: tasks.taskId,
      taskName: tasks.taskName,
      description: tasks.description,
      timeLimit: tasks.timeLimit,
      isVisible: tasks.isVisible,
      currentMemberId: tasks.productMemberId,
      typeName: taskTypes.taskTypeName,
    })
    .from(tasks)
    .innerJoin(productMembers, eq(tasks.productMemberId, productMembers.productMemberId))
    .leftJoin(taskTypes, eq(tasks.taskTypeId, taskTypes.taskTypeId))
    .where(
      and(
        eq(productMembers.productId, productId),
        isNull(tasks.completedAt),
        taskIds ? inArray(tasks.taskId, taskIds) : inArray(tasks.status, [...DEFAULT_TARGET_STATUSES]),
      ),
    )
    .orderBy(asc(tasks.taskId));
  if (taskIds && rows.length !== taskIds.length) {
    return { ok: false, status: 404, message: "指定したタスクが見つからないか、完了済みです" };
  }

  // 非公開のタスクは、外部の Jev に送らない(割り振りの対象から外す)
  const skipped: SuggestResult["skipped"] = rows
    .filter((r) => !r.isVisible)
    .map((r) => ({ taskId: r.taskId, taskName: r.taskName, reason: "private" }));
  const targets = rows.filter((r) => r.isVisible);
  if (targets.length === 0) return { ok: false, status: 400, message: NO_TARGET };

  // Jev に渡す、メンバーの状況
  const openCounts = await db
    .select({ memberId: tasks.productMemberId, n: count() })
    .from(tasks)
    .innerJoin(productMembers, eq(tasks.productMemberId, productMembers.productMemberId))
    .where(
      and(
        eq(productMembers.productId, productId),
        isNull(tasks.completedAt),
        notInArray(tasks.taskId, targets.map((t) => t.taskId)),
      ),
    )
    .groupBy(tasks.productMemberId);
  const recent = await db
    .select({ memberId: tasks.productMemberId, taskName: tasks.taskName })
    .from(tasks)
    .innerJoin(productMembers, eq(tasks.productMemberId, productMembers.productMemberId))
    .where(and(eq(productMembers.productId, productId), isNotNull(tasks.completedAt), eq(tasks.isVisible, true)))
    .orderBy(desc(tasks.completedAt))
    .limit(200);

  const infos: MemberInfo[] = candidates.map((m) => ({
    memberId: m.memberId,
    role: m.role,
    openTasks: openCounts.find((c) => c.memberId === m.memberId)?.n ?? 0,
    recentTasks: recent.filter((r) => r.memberId === m.memberId).map((r) => r.taskName),
  }));
  const taskInfos: TaskInfo[] = targets.map((t) => ({
    taskId: t.taskId,
    taskName: t.taskName,
    description: t.description,
    typeName: t.typeName,
    dueInDays: dueInDays(t.timeLimit, now),
  }));

  // Jev に聞く(大きいときは、タスクを分けて何回か)
  const aliases = memberAliases(infos);
  const scores: TaskScores[] = [];
  let model = "";
  let inputTokens = 0;
  for (const call of buildJevCalls(infos, taskInfos)) {
    try {
      const response = await jev.ask(call.request);
      model = response.model;
      inputTokens += response.usage?.input_tokens ?? 0;
      scores.push(...readScores(call, response, aliases));
    } catch (e) {
      if (e instanceof JevError) {
        if (e.kind === "not-configured") {
          return { ok: false, status: 503, message: "自動割り振りは設定されていません" };
        }
        return {
          ok: false,
          status: 502,
          message: "Jev に接続できませんでした。時間をおいて、もう一度試してください",
        };
      }
      throw e;
    }
  }

  const byId = new Map(targets.map((t) => [t.taskId, t]));
  for (const t of targets) {
    if (!scores.some((s) => s.taskId === t.taskId)) {
      skipped.push({ taskId: t.taskId, taskName: t.taskName, reason: "no-answer" });
    }
  }

  const planned = planAssignments(
    scores,
    candidates.map((m) => m.memberId),
    { maxPerMember: options.maxPerMember, minConfidence: options.minConfidence },
  );
  const assignments: Suggestion[] = [];
  for (const p of planned) {
    const task = byId.get(p.taskId)!;
    if (!p.memberId) {
      skipped.push({ taskId: p.taskId, taskName: task.taskName, reason: p.skipped! });
      continue;
    }
    const probabilities = scores.find((s) => s.taskId === p.taskId)!.probabilities;
    assignments.push({
      taskId: p.taskId,
      taskName: task.taskName,
      currentMemberId: task.currentMemberId,
      proposedMemberId: p.memberId,
      probability: p.probability ?? 0,
      confidence: p.confidence,
      changed: p.memberId !== task.currentMemberId,
      alternatives: Object.entries(probabilities)
        .filter(([memberId]) => memberId !== p.memberId)
        .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
        .slice(0, 2)
        .map(([memberId, probability]) => ({ memberId, probability })),
    });
  }
  console.info(
    `[auto-assign] product=${productId} model=${model} tasks=${targets.length} candidates=${candidates.length} inputTokens=${inputTokens}`,
  );
  return { ok: true, model, inputTokens, assignments, skipped };
}

export type ApplyResult = {
  ok: true;
  changed: { taskId: string; fromMemberId: string; toMemberId: string }[];
  /** 担当が今のままで、書き換えなかった件数 */
  unchanged: number;
};

/** トランザクションを巻き戻すための、確定の失敗 */
class ApplyAbort extends Error {
  constructor(readonly error: ApplyError) {
    super(error.message);
  }
}

const abort = (status: ApplyError["status"], message: string): never => {
  throw new ApplyAbort({ ok: false, status, message });
};

export async function apply(input: {
  productId: string;
  actorMemberId: string;
  assignments: { taskId: string; productMemberId: string }[];
}): Promise<ApplyResult | ApplyError> {
  const { productId, assignments } = input;
  const taskIds = assignments.map((a) => a.taskId);
  if (new Set(taskIds).size !== taskIds.length) {
    return { ok: false, status: 400, message: "同じタスクが重複しています" };
  }

  let changes: AssignedChange[];
  let unchanged = 0;
  try {
    changes = await db.transaction(async (tx) => {
      // タスクは、このプロダクトのものか。完了していないか
      const current = await tx
        .select({
          taskId: tasks.taskId,
          taskName: tasks.taskName,
          timeLimit: tasks.timeLimit,
          completedAt: tasks.completedAt,
          memberId: tasks.productMemberId,
        })
        .from(tasks)
        .innerJoin(productMembers, eq(tasks.productMemberId, productMembers.productMemberId))
        .where(and(eq(productMembers.productId, productId), inArray(tasks.taskId, taskIds)));
      if (current.length !== taskIds.length) abort(404, "タスクが見つかりません");
      if (current.some((t) => t.completedAt)) abort(409, "完了済みのタスクは付け替えられません");

      // 新しい担当者は、このプロダクトのメンバーか
      const toIds = [...new Set(assignments.map((a) => a.productMemberId))];
      const valid = await tx
        .select({ id: productMembers.productMemberId })
        .from(productMembers)
        .where(and(eq(productMembers.productId, productId), inArray(productMembers.productMemberId, toIds)));
      if (valid.length !== toIds.length) abort(400, "担当者はプロダクトのメンバーを指定してください");

      const done: AssignedChange[] = [];
      for (const a of assignments) {
        const task = current.find((t) => t.taskId === a.taskId)!;
        if (task.memberId === a.productMemberId) {
          unchanged++;
          continue;
        }
        // 確認から更新までの間に完了された場合は、巻き戻す
        const updated = await tx
          .update(tasks)
          .set({ productMemberId: a.productMemberId })
          .where(and(eq(tasks.taskId, a.taskId), isNull(tasks.completedAt)))
          .returning({ taskId: tasks.taskId });
        if (updated.length === 0) abort(409, "完了済みのタスクは付け替えられません");
        done.push({
          taskId: task.taskId,
          taskName: task.taskName,
          timeLimit: task.timeLimit,
          fromMemberId: task.memberId,
          toMemberId: a.productMemberId,
        });
      }
      return done;
    });
  } catch (e) {
    if (e instanceof ApplyAbort) return e.error;
    throw e;
  }

  await assignHooks.run({ productId, actorMemberId: input.actorMemberId, changes });
  return {
    ok: true,
    changed: changes.map(({ taskId, fromMemberId, toMemberId }) => ({ taskId, fromMemberId, toMemberId })),
    unchanged,
  };
}
