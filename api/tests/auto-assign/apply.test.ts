import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, spyOn } from "bun:test";
import { assignHooks, type AssignHook } from "../../src/lib/assign-hooks";
import { cleanup, createOutsider, findTask, insertTask, request, setupProduct } from "../task/helpers";

// 担当の付け替え(確定) PATCH /api/product/:productId/task/assignee(docs/v3.0/jev-assign.md)

type Ctx = Awaited<ReturnType<typeof setupProduct>>;
let p: Ctx;
let other: Ctx;
let a: string;
let b: string;
let c: string;
const warnSpy = spyOn(console, "warn");

beforeAll(async () => {
  p = await setupProduct({ members: 3 });
  other = await setupProduct({ members: 1 });
  [a, b, c] = p.members.map((m) => m.memberId) as [string, string, string];
  warnSpy.mockImplementation(() => {});
});
beforeEach(() => assignHooks.clear());
afterEach(() => assignHooks.clear());
afterAll(async () => {
  warnSpy.mockRestore();
  await cleanup();
});

const url = (productId = p.productId) => `/api/product/${productId}/task/assignee`;
const patch = (assignments: unknown, cookie = p.leader.cookie, productId = p.productId) =>
  request("PATCH", url(productId), { cookie, body: { assignments } });
const holder = async (taskId: string) => (await findTask(taskId))!.productMemberId;

describe("認証・権限", () => {
  it("cookie なしは 401", async () => {
    const body = { assignments: [{ taskId: crypto.randomUUID(), productMemberId: b }] };
    expect((await request("PATCH", url(), { body })).status).toBe(401);
  });
  it("所属していないユーザー・存在しないプロダクトは 404", async () => {
    const t = await insertTask(a);
    const o = await createOutsider();
    expect((await patch([{ taskId: t!.taskId, productMemberId: b }], o.cookie)).status).toBe(404);
    expect((await patch([{ taskId: t!.taskId, productMemberId: b }], p.leader.cookie, crypto.randomUUID())).status).toBe(404);
    expect(await holder(t!.taskId)).toBe(a);
  });
  it("メンバーは 403。何も変わらない", async () => {
    const t = await insertTask(a);
    const res = await patch([{ taskId: t!.taskId, productMemberId: b }], p.members[0]!.cookie);
    expect(res.status).toBe(403);
    expect(await holder(t!.taskId)).toBe(a);
  });
  it("body が不正なら 422(空・重複でない形の誤り・101 件)", async () => {
    expect((await patch([])).status).toBe(422);
    expect((await patch([{ taskId: "x", productMemberId: b }])).status).toBe(422);
    const many = Array.from({ length: 101 }, () => ({ taskId: crypto.randomUUID(), productMemberId: b }));
    expect((await patch(many)).status).toBe(422);
  });
});

describe("付け替え", () => {
  it("担当を付け替える。同じ担当のものは書き換えず、件数だけ返す", async () => {
    const t1 = await insertTask(a, { taskName: "付替-1" });
    const t2 = await insertTask(a, { taskName: "付替-2" });
    const t3 = await insertTask(b, { taskName: "付替-3" });
    const res = await patch([
      { taskId: t1!.taskId, productMemberId: b },
      { taskId: t2!.taskId, productMemberId: c },
      { taskId: t3!.taskId, productMemberId: b }, // 今のまま
    ]);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      changed: [
        { taskId: t1!.taskId, fromMemberId: a, toMemberId: b },
        { taskId: t2!.taskId, fromMemberId: a, toMemberId: c },
      ],
      unchanged: 1,
    });
    expect(await holder(t1!.taskId)).toBe(b);
    expect(await holder(t2!.taskId)).toBe(c);
    expect(await holder(t3!.taskId)).toBe(b);
  });

  it("タスクの他の項目(名前・状態・期限など)は変わらない。確認待ちのタスクも付け替えられる", async () => {
    const limit = new Date("2031-05-01T00:00:00Z");
    const t = await insertTask(a, { taskName: "そのまま", description: "説明", timeLimit: limit, reportedAt: new Date("2031-01-01T00:00:00Z") });
    expect((await patch([{ taskId: t!.taskId, productMemberId: b }])).status).toBe(200);
    const after = (await findTask(t!.taskId))!;
    expect(after).toMatchObject({ taskName: "そのまま", description: "説明", status: "reported", productMemberId: b });
    expect(after.timeLimit?.toISOString()).toBe(limit.toISOString());
  });

  it("PATCH .../task/:taskId(タスク情報変更)と取り違えない", async () => {
    const t = await insertTask(a, { taskName: "ルート" });
    const res = await request("PATCH", `/api/product/${p.productId}/task/${t!.taskId}`, {
      cookie: p.leader.cookie,
      body: { taskName: "ルート変更" },
    });
    expect(res.status).toBe(200);
    expect((await findTask(t!.taskId))!.taskName).toBe("ルート変更");
    expect(await holder(t!.taskId)).toBe(a);
  });
});

describe("条件に合わなければ、全件を巻き戻す", () => {
  it("他のプロダクトのタスクが混ざると 404。有効な分も書き換えない", async () => {
    const ok = await insertTask(a, { taskName: "巻戻-ok" });
    const foreign = await insertTask(other.members[0]!.memberId, { taskName: "巻戻-他" });
    const res = await patch([
      { taskId: ok!.taskId, productMemberId: b },
      { taskId: foreign!.taskId, productMemberId: b },
    ]);
    expect(res.status).toBe(404);
    expect(await holder(ok!.taskId)).toBe(a);
    expect(await holder(foreign!.taskId)).toBe(other.members[0]!.memberId);
  });

  it("完了済みが混ざると 409。有効な分も書き換えない", async () => {
    const ok = await insertTask(a, { taskName: "巻戻-ok" });
    const done = await insertTask(a, { taskName: "巻戻-完了", completedAt: new Date() });
    const res = await patch([
      { taskId: ok!.taskId, productMemberId: b },
      { taskId: done!.taskId, productMemberId: b },
    ]);
    expect(res.status).toBe(409);
    expect(await holder(ok!.taskId)).toBe(a);
    expect(await holder(done!.taskId)).toBe(a);
  });

  it("他のプロダクトのメンバーを担当にしようとすると 400。何も書き換えない", async () => {
    const t = await insertTask(a, { taskName: "巻戻-メンバー" });
    const res = await patch([{ taskId: t!.taskId, productMemberId: other.members[0]!.memberId }]);
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ message: "担当者はプロダクトのメンバーを指定してください" });
    expect(await holder(t!.taskId)).toBe(a);
  });

  it("存在しないタスク・メンバーは 404 / 400。同じタスクの重複は 400", async () => {
    const t = await insertTask(a, { taskName: "巻戻-重複" });
    expect((await patch([{ taskId: crypto.randomUUID(), productMemberId: b }])).status).toBe(404);
    expect((await patch([{ taskId: t!.taskId, productMemberId: crypto.randomUUID() }])).status).toBe(400);
    const dup = await patch([
      { taskId: t!.taskId, productMemberId: b },
      { taskId: t!.taskId, productMemberId: c },
    ]);
    expect(dup.status).toBe(400);
    expect(await holder(t!.taskId)).toBe(a);
  });
});

describe("付け替えたあとの処理(フック)", () => {
  it("付け替えた分だけ、まとめて、確定した人(リーダー)とともに渡す。同じ担当のものは渡さない", async () => {
    const hook = spyOn({ run: (() => {}) as AssignHook }, "run");
    assignHooks.register(hook);
    const limit = new Date("2031-06-01T00:00:00Z");
    const t1 = await insertTask(a, { taskName: "フック-1", timeLimit: limit });
    const t2 = await insertTask(b, { taskName: "フック-2" });
    await patch([
      { taskId: t1!.taskId, productMemberId: c },
      { taskId: t2!.taskId, productMemberId: b },
    ]);
    expect(hook).toHaveBeenCalledTimes(1);
    expect(hook.mock.calls[0]![0]).toEqual({
      productId: p.productId,
      actorMemberId: p.leader.memberId,
      changes: [{ taskId: t1!.taskId, taskName: "フック-1", timeLimit: limit, fromMemberId: a, toMemberId: c }],
    });
  });

  it("全件が同じ担当なら、フックは呼ばれない。巻き戻したときも呼ばれない", async () => {
    const hook = spyOn({ run: (() => {}) as AssignHook }, "run");
    assignHooks.register(hook);
    const t = await insertTask(a, { taskName: "フック-なし" });
    await patch([{ taskId: t!.taskId, productMemberId: a }]);
    await patch([{ taskId: t!.taskId, productMemberId: other.members[0]!.memberId }]);
    expect(hook).not.toHaveBeenCalled();
  });

  it("フックが失敗しても、付け替えは成功する。あとのフックも呼ばれる", async () => {
    const failing: AssignHook = async () => {
      throw new Error("通知に失敗");
    };
    const after = spyOn({ run: (() => {}) as AssignHook }, "run");
    assignHooks.register(failing);
    assignHooks.register(after);
    const t = await insertTask(a, { taskName: "フック-失敗" });
    const res = await patch([{ taskId: t!.taskId, productMemberId: b }]);
    expect(res.status).toBe(200);
    expect(await holder(t!.taskId)).toBe(b);
    expect(after).toHaveBeenCalledTimes(1);
    expect(warnSpy).toHaveBeenCalled();
  });
});
