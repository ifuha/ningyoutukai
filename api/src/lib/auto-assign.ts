/**
 * タスクの自動割り振りの、DB にも外部にも触れない部分(docs/v3.0/jev-assign.md の 4)。
 * - Jev に送る質問を作る(メンバーとタスクは短い別名 m1 / t1 に置き換え、UUID・氏名・メールは送らない)
 * - Jev の答え(候補ごとの確率)を読む
 * - 確率の高い順に、メンバーの上限を守って割り振りを決める
 */
import type { JevChoiceAnswer, JevRequest, JevResponse } from "./jev";

/** この確信度に満たない提案は、割り振らずに今のままにする(`minConfidence` で変えられる) */
export const DEFAULT_MIN_CONFIDENCE = 0.5;

/** 1 回の Jev 呼び出しに入れる JSON の大きさ(文字数)の目安。Jev の上限は 64k トークンで、日本語は 1 文字 ≒ 1 トークンとして余裕を見る */
export const MAX_REQUEST_CHARS = 40_000;

const DESCRIPTION_MAX = 500;
const RECENT_TASKS_MAX = 5;

export type MemberInfo = {
  memberId: string;
  role: "leader" | "member";
  /** 今回の割り振りの対象ではない、担当中(未完了)のタスクの数 */
  openTasks: number;
  /** 最近こなした(完了した)タスクの名前。新しい順 */
  recentTasks: string[];
};

export type TaskInfo = {
  taskId: string;
  taskName: string;
  description: string | null;
  typeName: string | null;
  /** 期限までの日数(過ぎていれば負)。期限がなければ null */
  dueInDays: number | null;
};

/** Jev の呼び出し 1 回ぶんと、別名を元の ID に戻す表 */
export type JevCall = {
  request: JevRequest;
  /** 質問名(t1…)→ タスク ID */
  taskByAlias: Record<string, string>;
};

const memberAlias = (index: number) => `m${index + 1}`;
const taskAlias = (index: number) => `t${index + 1}`;

/** メンバーの別名の表(m1 → memberId)。順番は渡された順(呼び出し側で安定した順に並べる) */
export function memberAliases(members: { memberId: string }[]): Record<string, string> {
  return Object.fromEntries(members.map((m, i) => [memberAlias(i), m.memberId]));
}

export function dueInDays(timeLimit: Date | null, now: Date): number | null {
  if (!timeLimit) return null;
  return Math.ceil((timeLimit.getTime() - now.getTime()) / 86_400_000);
}

const INSTRUCTIONS = (alias: string) =>
  `タスク ${alias} の担当に最も向くのは、どのメンバーか。` +
  "担当中のタスク(openTasks)が少ないメンバーを優先し、似たタスクをこなした経験(recentTasks)のあるメンバーも優先する。";

function stateOf(members: MemberInfo[], tasks: Record<string, unknown>) {
  return {
    members: Object.fromEntries(
      members.map((m, i) => [
        memberAlias(i),
        { role: m.role, openTasks: m.openTasks, recentTasks: m.recentTasks.slice(0, RECENT_TASKS_MAX) },
      ]),
    ),
    tasks,
  };
}

/**
 * Jev に送る質問を作る。タスクごとに `choice` を 1 つ(候補 = 候補のメンバー全員)。
 * 1 回に入れる大きさ(`MAX_REQUEST_CHARS`)を超えるときは、タスクを分けて複数回の呼び出しにする。
 * タスクの別名(t1…)は、分けても通し番号にする。
 */
export function buildJevCalls(members: MemberInfo[], tasks: TaskInfo[]): JevCall[] {
  const criteria = Object.fromEntries(members.map((_, i) => [memberAlias(i), ""]));
  const calls: JevCall[] = [];
  let current: { tasks: Record<string, unknown>; taskByAlias: Record<string, string> } | undefined;

  const flush = () => {
    if (!current || Object.keys(current.tasks).length === 0) return;
    const questions: JevRequest["questions"] = {};
    for (const alias of Object.keys(current.tasks)) {
      questions[alias] = { type: "choice", instructions: INSTRUCTIONS(alias), criteria };
    }
    calls.push({ request: { state: stateOf(members, current.tasks), questions }, taskByAlias: current.taskByAlias });
    current = undefined;
  };

  const sizeOf = (taskCount: number, tasksJson: string) =>
    JSON.stringify(stateOf(members, {})).length + tasksJson.length + taskCount * (JSON.stringify(criteria).length + 160);

  tasks.forEach((task, i) => {
    const alias = taskAlias(i);
    const value = {
      name: task.taskName,
      description: task.description ? task.description.slice(0, DESCRIPTION_MAX) : null,
      type: task.typeName,
      dueInDays: task.dueInDays,
    };
    current ??= { tasks: {}, taskByAlias: {} };
    const next = { ...current.tasks, [alias]: value };
    if (
      Object.keys(current.tasks).length > 0 &&
      sizeOf(Object.keys(next).length, JSON.stringify(next)) > MAX_REQUEST_CHARS
    ) {
      flush();
      current = { tasks: {}, taskByAlias: {} };
    }
    current.tasks[alias] = value;
    current.taskByAlias[alias] = task.taskId;
  });
  flush();
  return calls;
}

export type TaskScores = {
  taskId: string;
  /** memberId → 確率。答えに無い候補は 0 */
  probabilities: Record<string, number>;
  confidence: number | null;
};

const isChoice = (a: JevResponse["answers"][string] | undefined): a is JevChoiceAnswer =>
  !!a && a.type === "choice" && typeof (a as JevChoiceAnswer).probabilities === "object";

/** Jev の答えから、タスクごとの「メンバーごとの確率」を取り出す。答えの無いタスクは含めない */
export function readScores(
  call: JevCall,
  response: JevResponse,
  aliases: Record<string, string>,
): TaskScores[] {
  const scores: TaskScores[] = [];
  for (const [alias, taskId] of Object.entries(call.taskByAlias)) {
    const answer = response.answers[alias];
    if (!isChoice(answer)) continue;
    const probabilities: Record<string, number> = {};
    for (const [mAlias, memberId] of Object.entries(aliases)) {
      const p = answer.probabilities[mAlias];
      probabilities[memberId] = typeof p === "number" && Number.isFinite(p) ? p : 0;
    }
    const confidence = typeof answer.confidence === "number" ? answer.confidence : null;
    scores.push({ taskId, probabilities, confidence });
  }
  return scores;
}

export type PlannedTask = {
  taskId: string;
  /** 割り振られたメンバー。決まらなかったときは undefined */
  memberId?: string;
  probability?: number;
  confidence: number | null;
  /** 決まらなかった理由 */
  skipped?: "low-confidence" | "capacity";
};

/**
 * 確率の高い順に割り振りを決める。
 * すべての(タスク, メンバー)の組を確率の高い順に並べ、上から、そのタスクがまだ決まっておらず、
 * そのメンバーが上限に達していなければ決める。同じ確率は、タスク ID → メンバー ID の順(結果を毎回同じにする)。
 * 確信度が `minConfidence` に満たないタスクは、決めずに残す(確信度が分からないときは、決める)。
 * 上限の既定は ceil(決める対象のタスク数 ÷ 候補の人数)で、全タスクが 1 人に集まらないようにする。
 */
export function planAssignments(
  scores: TaskScores[],
  memberIds: string[],
  options: { maxPerMember?: number; minConfidence?: number } = {},
): PlannedTask[] {
  const minConfidence = options.minConfidence ?? DEFAULT_MIN_CONFIDENCE;
  const result = new Map<string, PlannedTask>();
  const candidates = scores.filter((s) => {
    const low = s.confidence !== null && s.confidence < minConfidence;
    if (low) result.set(s.taskId, { taskId: s.taskId, confidence: s.confidence, skipped: "low-confidence" });
    return !low;
  });

  const cap = options.maxPerMember ?? Math.ceil(candidates.length / Math.max(memberIds.length, 1));
  const load = new Map<string, number>();
  const confidenceOf = new Map(candidates.map((s) => [s.taskId, s.confidence]));

  const pairs = candidates.flatMap((s) =>
    memberIds.map((memberId) => ({ taskId: s.taskId, memberId, p: s.probabilities[memberId] ?? 0 })),
  );
  pairs.sort(
    (a, b) => b.p - a.p || a.taskId.localeCompare(b.taskId) || a.memberId.localeCompare(b.memberId),
  );
  for (const { taskId, memberId, p } of pairs) {
    if (result.has(taskId)) continue;
    const n = load.get(memberId) ?? 0;
    if (n >= cap) continue;
    load.set(memberId, n + 1);
    result.set(taskId, { taskId, memberId, probability: p, confidence: confidenceOf.get(taskId) ?? null });
  }
  for (const s of candidates) {
    if (!result.has(s.taskId)) {
      result.set(s.taskId, { taskId: s.taskId, confidence: s.confidence, skipped: "capacity" });
    }
  }
  // 入力の順に返す
  return scores.map((s) => result.get(s.taskId)!);
}
