import { afterAll, afterEach, beforeAll, describe, expect, it, spyOn } from "bun:test";
import { jev, JevError, type JevRequest, type JevResponse } from "../../src/lib/jev";
import {
  cleanup,
  createOutsider,
  createTaskType,
  findTask,
  insertTask,
  request,
  setupProduct,
} from "../task/helpers";

// 担当者の提案 POST /api/product/:productId/task/suggest-assignee(docs/v3.0/jev-assign.md)。
// Jev は差し替える(本物の API は呼ばない)

type Ctx = Awaited<ReturnType<typeof setupProduct>>;
let p: Ctx;
let other: Ctx;
const askSpy = spyOn(jev, "ask");
const infoSpy = spyOn(console, "info");

beforeAll(async () => {
  p = await setupProduct({ members: 2 });
  other = await setupProduct({ members: 1 });
  infoSpy.mockImplementation(() => {});
});
afterEach(() => askSpy.mockReset());
afterAll(async () => {
  askSpy.mockRestore();
  infoSpy.mockRestore();
  await cleanup();
});

const url = (productId = p.productId) => `/api/product/${productId}/task/suggest-assignee`;
const post = (body: unknown = {}, cookie = p.leader.cookie, productId = p.productId) =>
  request("POST", url(productId), { cookie, body });

/**
 * 「タスク名 → 担当に向くメンバー」の表どおりに答える Jev。向く人に 0.8、残りに均等に 0.2 を配る。
 * 候補の別名(m1…)は、メンバー ID の昇順(サービスが並べる順)。
 */
function fakeJev(favorites: Record<string, string>, confidence: number | null = 0.9) {
  const calls: JevRequest[] = [];
  askSpy.mockImplementation(async (req: JevRequest): Promise<JevResponse> => {
    calls.push(req);
    const state = req.state as { tasks: Record<string, { name: string }> };
    const answers: JevResponse["answers"] = {};
    for (const [alias, question] of Object.entries(req.questions)) {
      const aliases = Object.keys(question.criteria);
      const ids = candidateOrder(aliases.length);
      const favorite = favorites[state.tasks[alias]!.name];
      const rest = 0.2 / Math.max(aliases.length - 1, 1);
      const probabilities = Object.fromEntries(
        aliases.map((a, i) => [a, ids[i] === favorite ? 0.8 : rest]),
      );
      answers[alias] = {
        type: "choice",
        choice: aliases.find((_, i) => ids[i] === favorite) ?? aliases[0]!,
        confidence,
        probabilities,
      };
    }
    return { model: "jev-1.14.0", answers, usage: { input_tokens: 123, output_tokens: 7 } };
  });
  return calls;
}

/** 提案の候補(今は、除外しない全員)の ID を、サービスと同じ昇順に並べたもの */
let candidates: string[] = [];
const candidateOrder = (n: number) => candidates.slice(0, n);
const useCandidates = (ids: string[]) => (candidates = [...ids].sort());

const all = () => [p.leader.memberId, ...p.members.map((m) => m.memberId)];

describe("認証・権限", () => {
  it("cookie なしは 401", async () => {
    expect((await request("POST", url(), { body: {} })).status).toBe(401);
  });
  it("所属していないユーザーは 404、存在しないプロダクトも 404", async () => {
    const o = await createOutsider();
    expect((await post({}, o.cookie)).status).toBe(404);
    expect((await post({}, p.leader.cookie, crypto.randomUUID())).status).toBe(404);
  });
  it("メンバーは 403。Jev は呼ばれない", async () => {
    const res = await post({}, p.members[0]!.cookie);
    expect(res.status).toBe(403);
    expect(askSpy).not.toHaveBeenCalled();
  });
  it("body が不正なら 422", async () => {
    expect((await post({ maxPerMember: 0 })).status).toBe(422);
    expect((await post({ taskIds: [] })).status).toBe(422);
    expect((await post({ minConfidence: 2 })).status).toBe(422);
  });
});

describe("提案", () => {
  it("確率の高い順に提案する。今の担当との違い・確信度・次点・使った量を返し、何も書き換えない", async () => {
    const [a, b] = [p.members[0]!.memberId, p.members[1]!.memberId];
    const t1 = await insertTask(a, { taskName: "提案-1" });
    const t2 = await insertTask(a, { taskName: "提案-2" });
    useCandidates(all());
    // t1 は b に、t2 は a のまま(向く人 = 今の担当)
    const calls = fakeJev({ "提案-1": b, "提案-2": a });

    const res = await post({ taskIds: [t1!.taskId, t2!.taskId] });
    expect(res.status).toBe(200);
    const body = (await res.json()) as any;
    expect(body.model).toBe("jev-1.14.0");
    expect(body.inputTokens).toBe(123);
    expect(body.skipped).toEqual([]);

    const byTask = Object.fromEntries(body.assignments.map((x: any) => [x.taskId, x]));
    expect(byTask[t1!.taskId]).toMatchObject({
      taskName: "提案-1",
      currentMemberId: a,
      proposedMemberId: b,
      probability: 0.8,
      confidence: 0.9,
      changed: true,
    });
    expect(byTask[t1!.taskId].alternatives).toHaveLength(2);
    expect(byTask[t1!.taskId].alternatives.map((x: any) => x.memberId)).not.toContain(b);
    expect(byTask[t2!.taskId]).toMatchObject({ proposedMemberId: a, changed: false });

    // 書き換えていない
    expect((await findTask(t1!.taskId))!.productMemberId).toBe(a);
    // Jev へは 1 回の呼び出しで、全タスクの質問をまとめて送った。UUID は送っていない
    expect(calls).toHaveLength(1);
    expect(Object.keys(calls[0]!.questions)).toEqual(["t1", "t2"]);
    expect(JSON.stringify(calls[0])).not.toContain(a);
    expect(JSON.stringify(calls[0])).not.toContain(t1!.taskId);
  });

  it("対象を省くと、作業中と差し戻し中のタスクだけ。確認待ち・完了・他プロダクトは入らない", async () => {
    const c = await setupProduct({ members: 2 });
    const [a, b] = c.members.map((m) => m.memberId) as [string, string];
    const inProgress = await insertTask(a, { taskName: "作業中" });
    const rejected = await insertTask(a, { taskName: "差し戻し", status: "rejected" });
    await insertTask(a, { taskName: "確認待ち", reportedAt: new Date() });
    await insertTask(a, { taskName: "完了", completedAt: new Date() });
    await insertTask(other.members[0]!.memberId, { taskName: "他プロダクト" });
    useCandidates([c.leader.memberId, a, b]);
    const calls = fakeJev({});

    const res = await post({}, c.leader.cookie, c.productId);
    expect(res.status).toBe(200);
    const body = (await res.json()) as any;
    expect(body.assignments.map((x: any) => x.taskId).sort()).toEqual([inProgress!.taskId, rejected!.taskId].sort());
    const sent = Object.values((calls[0]!.state as any).tasks).map((t: any) => t.name);
    expect(sent.sort()).toEqual(["作業中", "差し戻し"]);
  });

  it("非公開のタスクは Jev に送らず、skipped(private)にする", async () => {
    const c = await setupProduct({ members: 2 });
    const a = c.members[0]!.memberId;
    const visible = await insertTask(a, { taskName: "公開" });
    const hidden = await insertTask(a, { taskName: "秘密の内容", isVisible: false });
    useCandidates([c.leader.memberId, a, c.members[1]!.memberId]);
    const calls = fakeJev({});

    const body = (await (await post({}, c.leader.cookie, c.productId)).json()) as any;
    expect(body.assignments.map((x: any) => x.taskId)).toEqual([visible!.taskId]);
    expect(body.skipped).toEqual([{ taskId: hidden!.taskId, taskName: "秘密の内容", reason: "private" }]);
    expect(JSON.stringify(calls)).not.toContain("秘密の内容");
  });

  it("Jev に渡す状況: 担当中のタスク数(対象を除く)と、最近こなしたタスクの名前・種類・期限", async () => {
    const c = await setupProduct({ members: 2 });
    const [a, b] = c.members.map((m) => m.memberId) as [string, string];
    const type = await createTaskType(c.productId, "レビュー");
    const target = await insertTask(a, {
      taskName: "対象",
      taskTypeId: type!.taskTypeId,
      description: "説明",
      timeLimit: new Date(Date.now() + 3 * 86_400_000 - 1000),
    });
    await insertTask(a, { taskName: "他の担当中-1" });
    await insertTask(a, { taskName: "他の担当中-2", reportedAt: new Date() });
    await insertTask(a, { taskName: "過去の完了", completedAt: new Date() });
    await insertTask(a, { taskName: "非公開の完了", completedAt: new Date(), isVisible: false });
    useCandidates([c.leader.memberId, a, b]);
    const calls = fakeJev({});

    await post({ taskIds: [target!.taskId] }, c.leader.cookie, c.productId);
    const state = calls[0]!.state as any;
    const index = candidates.indexOf(a);
    expect(state.members[`m${index + 1}`]).toEqual({
      role: "member",
      openTasks: 2, // 対象は数えない・完了は数えない
      recentTasks: ["過去の完了"], // 非公開の完了は送らない
    });
    expect(state.tasks.t1).toMatchObject({ name: "対象", description: "説明", dueInDays: 3 });
    expect(state.tasks.t1.type).toStartWith("レビュー");
  });

  it("taskIds で指定できる。他プロダクトや完了済みが混ざると 404", async () => {
    const t = await insertTask(p.members[0]!.memberId, { taskName: "指定-1" });
    useCandidates(all());
    fakeJev({});
    expect((await post({ taskIds: [t!.taskId] })).status).toBe(200);

    const foreign = await insertTask(other.members[0]!.memberId, { taskName: "他" });
    expect((await post({ taskIds: [t!.taskId, foreign!.taskId] })).status).toBe(404);

    const done = await insertTask(p.members[0]!.memberId, { taskName: "完了", completedAt: new Date() });
    expect((await post({ taskIds: [done!.taskId] })).status).toBe(404);
    expect((await post({ taskIds: [crypto.randomUUID()] })).status).toBe(404);
  });

  it("excludeMemberIds で候補から外せる。外した人は提案されない", async () => {
    const c = await setupProduct({ members: 2 });
    const [a, b] = c.members.map((m) => m.memberId) as [string, string];
    const t = await insertTask(a, { taskName: "除外" });
    useCandidates([c.leader.memberId, a, b]);
    const calls = fakeJev({ 除外: c.leader.memberId });

    const res = await post({ taskIds: [t!.taskId], excludeMemberIds: [c.leader.memberId] }, c.leader.cookie, c.productId);
    expect(res.status).toBe(200);
    const body = (await res.json()) as any;
    expect(Object.keys(calls[0]!.questions.t1!.criteria)).toEqual(["m1", "m2"]);
    expect(body.assignments[0].proposedMemberId).not.toBe(c.leader.memberId);
    expect(body.assignments[0].alternatives.map((x: any) => x.memberId)).not.toContain(c.leader.memberId);
  });

  it("候補が 2 人に満たない・対象が 0 件・外すメンバーが別プロダクトなら 400。Jev は呼ばれない", async () => {
    const c = await setupProduct({ members: 1 }); // リーダー + 1 人
    await insertTask(c.members[0]!.memberId, { taskName: "少人数" });
    expect((await post({ excludeMemberIds: [c.leader.memberId] }, c.leader.cookie, c.productId)).status).toBe(400);
    expect((await post({ excludeMemberIds: [other.leader.memberId] }, c.leader.cookie, c.productId)).status).toBe(400);

    const empty = await setupProduct({ members: 2 });
    const res = await post({}, empty.leader.cookie, empty.productId);
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ message: "対象のタスクがありません" });
    expect(askSpy).not.toHaveBeenCalled();
  });

  it("確信度が低い提案は、割り振らずに skipped(low-confidence)にする。minConfidence で変えられる", async () => {
    const c = await setupProduct({ members: 2 });
    const a = c.members[0]!.memberId;
    const t = await insertTask(a, { taskName: "自信なし" });
    useCandidates([c.leader.memberId, a, c.members[1]!.memberId]);
    fakeJev({ 自信なし: c.members[1]!.memberId }, 0.3);

    const low = (await (await post({}, c.leader.cookie, c.productId)).json()) as any;
    expect(low.assignments).toEqual([]);
    expect(low.skipped).toEqual([{ taskId: t!.taskId, taskName: "自信なし", reason: "low-confidence" }]);

    const loose = (await (await post({ minConfidence: 0.2 }, c.leader.cookie, c.productId)).json()) as any;
    expect(loose.assignments).toHaveLength(1);
  });

  it("上限(maxPerMember)に収まらないタスクは skipped(capacity)", async () => {
    const c = await setupProduct({ members: 2 });
    const a = c.members[0]!.memberId;
    await insertTask(a, { taskName: "上限-1" });
    await insertTask(a, { taskName: "上限-2" });
    await insertTask(a, { taskName: "上限-3" });
    // リーダーを外して 2 人 × 上限 1 = 2 枠。3 件のうち 1 件は収まらない
    useCandidates([a, c.members[1]!.memberId]);
    fakeJev({});
    const body = (await (await post({ maxPerMember: 1, excludeMemberIds: [c.leader.memberId] }, c.leader.cookie, c.productId)).json()) as any;
    expect(body.assignments).toHaveLength(2);
    expect(body.skipped.map((s: any) => s.reason)).toEqual(["capacity"]);
  });
});

describe("Jev の失敗", () => {
  it("接続できない・タイムアウト・レート制限は 502。何も書き換えない", async () => {
    const c = await setupProduct({ members: 2 });
    const t = await insertTask(c.members[0]!.memberId, { taskName: "失敗" });
    for (const kind of ["upstream", "timeout", "rate-limited"] as const) {
      askSpy.mockRejectedValueOnce(new JevError(kind, "内部の詳細"));
      const res = await post({}, c.leader.cookie, c.productId);
      expect(res.status).toBe(502);
      const message = ((await res.json()) as any).message as string;
      expect(message).toContain("Jev に接続できませんでした");
      expect(message).not.toContain("内部の詳細");
    }
    expect((await findTask(t!.taskId))!.productMemberId).toBe(c.members[0]!.memberId);
  });

  it("キー未設定は 503", async () => {
    const c = await setupProduct({ members: 2 });
    await insertTask(c.members[0]!.memberId, { taskName: "未設定" });
    askSpy.mockRejectedValueOnce(new JevError("not-configured", "TYPESAFE_API_KEY が未設定です"));
    const res = await post({}, c.leader.cookie, c.productId);
    expect(res.status).toBe(503);
    expect(await res.json()).toEqual({ message: "自動割り振りは設定されていません" });
  });

  it("答えの無いタスクは skipped(no-answer)", async () => {
    const c = await setupProduct({ members: 2 });
    const t = await insertTask(c.members[0]!.memberId, { taskName: "答えなし" });
    askSpy.mockResolvedValue({ model: "jev-1.14.0", answers: {}, usage: { input_tokens: 1, output_tokens: 0 } });
    const body = (await (await post({}, c.leader.cookie, c.productId)).json()) as any;
    expect(body.assignments).toEqual([]);
    expect(body.skipped).toEqual([{ taskId: t!.taskId, taskName: "答えなし", reason: "no-answer" }]);
  });
});
