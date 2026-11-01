import { describe, expect, it } from "bun:test";
import {
  MAX_REQUEST_CHARS,
  buildJevCalls,
  dueInDays,
  memberAliases,
  planAssignments,
  readScores,
  type MemberInfo,
  type TaskInfo,
  type TaskScores,
} from "../../src/lib/auto-assign";
import type { JevResponse } from "../../src/lib/jev";

// タスクの自動割り振りの、DB にも外部にも触れない部分(docs/v3.0/jev-assign.md の 4)

const member = (memberId: string, over: Partial<MemberInfo> = {}): MemberInfo => ({
  memberId,
  role: "member",
  openTasks: 0,
  recentTasks: [],
  ...over,
});
const task = (taskId: string, over: Partial<TaskInfo> = {}): TaskInfo => ({
  taskId,
  taskName: `タスク ${taskId}`,
  description: null,
  typeName: null,
  dueInDays: null,
  ...over,
});
const score = (taskId: string, probabilities: Record<string, number>, confidence: number | null = 0.9): TaskScores => ({
  taskId,
  probabilities,
  confidence,
});

describe("planAssignments(確率の高い順に、上限を守って決める)", () => {
  it("確率がいちばん高いメンバーに決める", () => {
    const plan = planAssignments(
      [score("t1", { a: 0.7, b: 0.2, c: 0.1 }), score("t2", { a: 0.1, b: 0.8, c: 0.1 }), score("t3", { a: 0.1, b: 0.1, c: 0.8 })],
      ["a", "b", "c"],
    );
    expect(plan.map((p) => p.memberId)).toEqual(["a", "b", "c"]);
    expect(plan.map((p) => p.probability)).toEqual([0.7, 0.8, 0.8]);
  });

  it("全タスクが同じ人に集まりそうでも、上限(既定は ceil(タスク数 ÷ 人数))で分ける。確率の高い組から先に決まる", () => {
    // 4 タスク・2 人 → 上限 2。a の確率が全部高い
    const plan = planAssignments(
      [
        score("t1", { a: 0.9, b: 0.1 }),
        score("t2", { a: 0.8, b: 0.2 }),
        score("t3", { a: 0.7, b: 0.3 }),
        score("t4", { a: 0.6, b: 0.4 }),
      ],
      ["a", "b"],
    );
    expect(plan.map((p) => p.memberId)).toEqual(["a", "a", "b", "b"]);
  });

  it("上限は maxPerMember で変えられる。足りないタスクは capacity で残る", () => {
    const plan = planAssignments(
      [score("t1", { a: 0.9, b: 0.1 }), score("t2", { a: 0.8, b: 0.2 }), score("t3", { a: 0.7, b: 0.3 })],
      ["a", "b"],
      { maxPerMember: 1 },
    );
    // 確率の高い順: t1→a(0.9)、t3→b(0.3)が先に決まり、t2→b(0.2)は b が埋まっている
    expect(plan.map((p) => p.memberId)).toEqual(["a", undefined, "b"]);
    expect(plan[1]!.skipped).toBe("capacity");
  });

  it("確信度が minConfidence に満たないタスクは、決めずに残す。確信度が分からない(null)ときは決める", () => {
    const plan = planAssignments(
      [score("t1", { a: 0.6, b: 0.4 }, 0.3), score("t2", { a: 0.6, b: 0.4 }, null), score("t3", { a: 0.6, b: 0.4 }, 0.5)],
      ["a", "b"],
    );
    expect(plan[0]!.memberId).toBeUndefined();
    expect(plan[0]!.skipped).toBe("low-confidence");
    expect(plan[1]!.memberId).toBeDefined();
    expect(plan[2]!.memberId).toBeDefined(); // ちょうど 0.5 は決める
  });

  it("確信度が低いタスクは、上限の数え方に入らない", () => {
    // 3 タスクのうち 1 つが低確信度 → 決める対象は 2 → 上限は ceil(2/2)=1
    const plan = planAssignments(
      [score("t1", { a: 0.9, b: 0.1 }, 0.1), score("t2", { a: 0.9, b: 0.1 }), score("t3", { a: 0.8, b: 0.2 })],
      ["a", "b"],
    );
    expect(plan.map((p) => p.memberId)).toEqual([undefined, "a", "b"]);
  });

  it("minConfidence を 0 にすれば、低い確信度でも決める", () => {
    const plan = planAssignments([score("t1", { a: 0.6, b: 0.4 }, 0.1)], ["a", "b"], { minConfidence: 0 });
    expect(plan[0]!.memberId).toBe("a");
  });

  it("同じ確率なら、タスク ID → メンバー ID の順で決める(結果が毎回同じ)", () => {
    const scores = [score("t2", { a: 0.5, b: 0.5 }), score("t1", { a: 0.5, b: 0.5 })];
    const first = planAssignments(scores, ["a", "b"]);
    const second = planAssignments([...scores].reverse(), ["a", "b"]);
    const byTask = (plan: ReturnType<typeof planAssignments>) =>
      Object.fromEntries(plan.map((p) => [p.taskId, p.memberId]));
    expect(byTask(first)).toEqual(byTask(second));
    // t1 が先に a を取り、上限 1 のため t2 は b
    expect(byTask(first)).toEqual({ t1: "a", t2: "b" });
  });

  it("入力の順に返す。答えに無いメンバーの確率は 0 として扱う", () => {
    const plan = planAssignments([score("t1", { a: 0.4 }), score("t0", { b: 0.9 })], ["a", "b"]);
    expect(plan.map((p) => p.taskId)).toEqual(["t1", "t0"]);
    expect(plan.map((p) => p.memberId)).toEqual(["a", "b"]);
  });

  it("タスクが 0 件・候補が 0 人でも落ちない", () => {
    expect(planAssignments([], ["a"])).toEqual([]);
    const plan = planAssignments([score("t1", {})], []);
    expect(plan[0]!.memberId).toBeUndefined();
    expect(plan[0]!.skipped).toBe("capacity");
  });
});

describe("buildJevCalls(Jev に送る質問)", () => {
  it("メンバーとタスクは別名(m1/t1)で送り、UUID・氏名・メールは入らない", () => {
    const members = [member("11111111-aaaa", { role: "leader", openTasks: 3, recentTasks: ["前のタスク"] }), member("22222222-bbbb")];
    const tasks = [task("33333333-cccc", { taskName: "招待のレビュー", description: "詳しい説明", typeName: "レビュー", dueInDays: 3 })];
    const [call] = buildJevCalls(members, tasks);
    const json = JSON.stringify(call!.request);
    expect(json).not.toContain("11111111");
    expect(json).not.toContain("33333333");
    expect(call!.taskByAlias).toEqual({ t1: "33333333-cccc" });
    expect(call!.request.questions.t1).toMatchObject({ type: "choice", criteria: { m1: "", m2: "" } });
    expect(call!.request.state).toEqual({
      members: {
        m1: { role: "leader", openTasks: 3, recentTasks: ["前のタスク"] },
        m2: { role: "member", openTasks: 0, recentTasks: [] },
      },
      tasks: { t1: { name: "招待のレビュー", description: "詳しい説明", type: "レビュー", dueInDays: 3 } },
    });
  });

  it("説明は 500 文字まで、最近のタスクは 5 件までにする", () => {
    const [call] = buildJevCalls(
      [member("a", { recentTasks: ["1", "2", "3", "4", "5", "6", "7"] }), member("b")],
      [task("t", { description: "あ".repeat(900) })],
    );
    const state = call!.request.state as { members: any; tasks: any };
    expect(state.tasks.t1.description).toHaveLength(500);
    expect(state.members.m1.recentTasks).toEqual(["1", "2", "3", "4", "5"]);
  });

  it("大きいときは、タスクを分けて複数回の呼び出しにする(別名は通し番号。分けても全タスクが入る)", () => {
    const big = "あ".repeat(500);
    const tasks = Array.from({ length: 120 }, (_, i) => task(`id-${i}`, { taskName: `タスク${i}`, description: big }));
    const calls = buildJevCalls([member("a"), member("b")], tasks);
    expect(calls.length).toBeGreaterThan(1);
    for (const c of calls) expect(JSON.stringify(c.request).length).toBeLessThanOrEqual(MAX_REQUEST_CHARS);
    const all = calls.flatMap((c) => Object.entries(c.taskByAlias));
    expect(all).toHaveLength(120);
    expect(new Set(all.map(([alias]) => alias)).size).toBe(120);
    expect(all.find(([alias]) => alias === "t120")?.[1]).toBe("id-119");
  });

  it("タスクが 0 件なら、呼び出しもない", () => {
    expect(buildJevCalls([member("a"), member("b")], [])).toEqual([]);
  });
});

describe("readScores(Jev の答えを読む)", () => {
  const members = [member("ma"), member("mb")];
  const aliases = memberAliases(members);
  const call = { request: { state: {}, questions: {} }, taskByAlias: { t1: "task-1", t2: "task-2" } };
  const response = (answers: JevResponse["answers"]): JevResponse => ({
    model: "jev-1.14.0",
    answers,
    usage: { input_tokens: 10, output_tokens: 1 },
  });

  it("別名を元の ID に戻す。答えの無いタスクは含めない。数でない確率は 0", () => {
    const scores = readScores(
      call,
      response({
        t1: { type: "choice", choice: "m2", confidence: 0.8, probabilities: { m1: 0.2, m2: 0.8 } },
        t2: { type: "noul" },
      }),
      aliases,
    );
    expect(scores).toEqual([{ taskId: "task-1", probabilities: { ma: 0.2, mb: 0.8 }, confidence: 0.8 }]);

    const odd = readScores(
      call,
      response({ t1: { type: "choice", choice: "m1", confidence: null, probabilities: { m1: 0.9, m2: "x" as unknown as number } } }),
      aliases,
    );
    expect(odd[0]).toEqual({ taskId: "task-1", probabilities: { ma: 0.9, mb: 0 }, confidence: null });
  });
});

describe("dueInDays", () => {
  const now = new Date("2030-01-10T00:00:00Z");
  it("期限までの日数(切り上げ)。過ぎていれば負。期限なしは null", () => {
    expect(dueInDays(null, now)).toBeNull();
    expect(dueInDays(new Date("2030-01-13T00:00:00Z"), now)).toBe(3);
    expect(dueInDays(new Date("2030-01-10T12:00:00Z"), now)).toBe(1);
    expect(dueInDays(new Date("2030-01-08T00:00:00Z"), now)).toBe(-2);
  });
});
