import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import {
  cleanup,
  createOutsider,
  createTaskType,
  findTask,
  insertTask,
  request,
  setupProduct,
} from "./helpers";

type Setup = Awaited<ReturnType<typeof setupProduct>>;
let a: Setup; // 検証するプロダクト
let b: Setup; // 別プロダクト

const url = (productId: string, taskId: string) =>
  `/api/product/${productId}/task/${taskId}`;
const patch = (cookie: string | undefined, taskId: string, body: unknown, productId = a.productId) =>
  request("PATCH", url(productId, taskId), { cookie, body });

beforeAll(async () => {
  a = await setupProduct();
  b = await setupProduct();
});
afterAll(async () => {
  await cleanup();
});

describe("認証・権限", () => {
  test("cookie なしは 401", async () => {
    const task = await insertTask(a.members[0]!.memberId);
    const res = await patch(undefined, task.taskId, { taskName: "x" });
    expect(res.status).toBe(401);
  });

  test("所属していないユーザーは 404", async () => {
    const outsider = await createOutsider();
    const task = await insertTask(a.members[0]!.memberId);
    const res = await patch(outsider.cookie, task.taskId, { taskName: "x" });
    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ message: "プロダクトが見つかりません" });
    expect((await findTask(task.taskId))!.taskName).toBe("テストタスク");
  });

  test("存在しないプロダクトは 404", async () => {
    const task = await insertTask(a.members[0]!.memberId);
    const res = await patch(a.leader.cookie, task.taskId, { taskName: "x" }, crypto.randomUUID());
    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ message: "プロダクトが見つかりません" });
  });

  test("メンバーは 403(自分が担当のタスクでも)で変更されない", async () => {
    const m = a.members[0]!;
    const task = await insertTask(m.memberId);
    const res = await patch(m.cookie, task.taskId, { taskName: "x" });
    expect(res.status).toBe(403);
    expect(await res.json()).toEqual({ message: "プロダクトリーダーのみ実行できます" });
    expect((await findTask(task.taskId))!.taskName).toBe("テストタスク");
  });

  test("productId / taskId が uuid でなければ 422", async () => {
    const task = await insertTask(a.members[0]!.memberId);
    const r1 = await patch(a.leader.cookie, task.taskId, { taskName: "x" }, "abc");
    expect(r1.status).toBe(422);
    const r2 = await patch(a.leader.cookie, "abc", { taskName: "x" });
    expect(r2.status).toBe(422);
  });
});

describe("タスクの存在", () => {
  test("存在しない taskId は 404", async () => {
    const res = await patch(a.leader.cookie, crypto.randomUUID(), { taskName: "x" });
    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ message: "タスクが見つかりません" });
  });

  test("別プロダクトのタスクは 404 で変更されない", async () => {
    const other = await insertTask(b.members[0]!.memberId);
    const res = await patch(a.leader.cookie, other.taskId, { taskName: "x" });
    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ message: "タスクが見つかりません" });
    expect((await findTask(other.taskId))!.taskName).toBe("テストタスク");
  });
});

describe("各項目の更新", () => {
  test("taskName のみ更新し、他の項目は変わらない", async () => {
    const m = a.members[0]!;
    const limit = new Date("2030-01-01T00:00:00.000Z");
    const task = await insertTask(m.memberId, {
      description: "説明",
      timeLimit: limit,
      isVisible: false,
    });
    const res = await patch(a.leader.cookie, task.taskId, { taskName: "新しい名前" });
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json).toEqual({
      taskId: task.taskId,
      taskName: "新しい名前",
      description: "説明",
      timeLimit: limit.toISOString(),
      reportedAt: null,
      completedAt: null,
      taskTypeId: null,
      productMemberId: m.memberId,
      isVisible: false,
    });
    const row = (await findTask(task.taskId))!;
    expect(row.taskName).toBe("新しい名前");
    expect(row.description).toBe("説明");
    expect(row.timeLimit!.getTime()).toBe(limit.getTime());
    expect(row.isVisible).toBe(false);
  });

  test("description を更新できる", async () => {
    const task = await insertTask(a.members[0]!.memberId);
    const res = await patch(a.leader.cookie, task.taskId, { description: "詳細" });
    expect(res.status).toBe(200);
    expect((await res.json()).description).toBe("詳細");
    const row = (await findTask(task.taskId))!;
    expect(row.description).toBe("詳細");
    expect(row.taskName).toBe("テストタスク");
  });

  test("timeLimit を更新できる", async () => {
    const task = await insertTask(a.members[0]!.memberId);
    const res = await patch(a.leader.cookie, task.taskId, { timeLimit: "2031-05-06T07:08:09.000Z" });
    expect(res.status).toBe(200);
    expect((await res.json()).timeLimit).toBe("2031-05-06T07:08:09.000Z");
    expect((await findTask(task.taskId))!.timeLimit!.toISOString()).toBe("2031-05-06T07:08:09.000Z");
  });

  test("isVisible を更新できる", async () => {
    const task = await insertTask(a.members[0]!.memberId);
    const res = await patch(a.leader.cookie, task.taskId, { isVisible: false });
    expect(res.status).toBe(200);
    expect((await res.json()).isVisible).toBe(false);
    expect((await findTask(task.taskId))!.isVisible).toBe(false);
  });

  test("複数項目を同時に更新できる", async () => {
    const task = await insertTask(a.members[0]!.memberId);
    const res = await patch(a.leader.cookie, task.taskId, {
      taskName: "まとめて",
      description: "d",
      isVisible: false,
    });
    expect(res.status).toBe(200);
    const row = (await findTask(task.taskId))!;
    expect([row.taskName, row.description, row.isVisible]).toEqual(["まとめて", "d", false]);
  });

  test("description と timeLimit を null にして消せる", async () => {
    const task = await insertTask(a.members[0]!.memberId, {
      description: "消す",
      timeLimit: new Date("2030-01-01T00:00:00Z"),
    });
    const res = await patch(a.leader.cookie, task.taskId, { description: null, timeLimit: null });
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.description).toBeNull();
    expect(json.timeLimit).toBeNull();
    const row = (await findTask(task.taskId))!;
    expect(row.description).toBeNull();
    expect(row.timeLimit).toBeNull();
  });

  test("完了済みのタスクも変更できる", async () => {
    const completedAt = new Date("2029-01-01T00:00:00Z");
    const task = await insertTask(a.members[0]!.memberId, { completedAt });
    const res = await patch(a.leader.cookie, task.taskId, { taskName: "完了後に変更" });
    expect(res.status).toBe(200);
    const row = (await findTask(task.taskId))!;
    expect(row.taskName).toBe("完了後に変更");
    expect(row.completedAt!.getTime()).toBe(completedAt.getTime());
  });
});

describe("taskName の検証", () => {
  test("前後の空白は除去される", async () => {
    const task = await insertTask(a.members[0]!.memberId);
    const res = await patch(a.leader.cookie, task.taskId, { taskName: "  名前  " });
    expect(res.status).toBe(200);
    expect((await res.json()).taskName).toBe("名前");
    expect((await findTask(task.taskId))!.taskName).toBe("名前");
  });

  test("空白のみ・空文字は 400 で変更されない", async () => {
    const task = await insertTask(a.members[0]!.memberId);
    for (const taskName of ["   ", ""]) {
      const res = await patch(a.leader.cookie, task.taskId, { taskName });
      expect(res.status).toBe(400);
    }
    expect((await findTask(task.taskId))!.taskName).toBe("テストタスク");
  });

  test("200 文字は OK、201 文字は 422", async () => {
    const task = await insertTask(a.members[0]!.memberId);
    const ok = await patch(a.leader.cookie, task.taskId, { taskName: "あ".repeat(200) });
    expect(ok.status).toBe(200);
    const ng = await patch(a.leader.cookie, task.taskId, { taskName: "あ".repeat(201) });
    expect(ng.status).toBe(422);
    expect((await findTask(task.taskId))!.taskName).toBe("あ".repeat(200));
  });
});

describe("body の検証", () => {
  test("{} は 400", async () => {
    const task = await insertTask(a.members[0]!.memberId);
    const res = await patch(a.leader.cookie, task.taskId, {});
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ message: "変更する項目を指定してください" });
  });

  test("不正な型は 422", async () => {
    const task = await insertTask(a.members[0]!.memberId);
    for (const body of [
      { isVisible: "false" },
      { taskName: 123 },
      { description: 1 },
      { timeLimit: "明日" },
      { timeLimit: 12345 },
      { productMemberId: "abc" },
      { productMemberId: null },
    ]) {
      const res = await patch(a.leader.cookie, task.taskId, body);
      expect(res.status).toBe(422);
    }
    const row = (await findTask(task.taskId))!;
    expect(row.taskName).toBe("テストタスク");
    expect(row.isVisible).toBe(true);
  });
});

describe("担当者の変更", () => {
  test("別プロダクトのメンバーは 400 で変更されない", async () => {
    const m = a.members[0]!;
    const task = await insertTask(m.memberId);
    const res = await patch(a.leader.cookie, task.taskId, {
      productMemberId: b.members[0]!.memberId,
      taskName: "同時に変えない",
    });
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ message: "担当者はプロダクトのメンバーを指定してください" });
    const row = (await findTask(task.taskId))!;
    expect(row.productMemberId).toBe(m.memberId);
    expect(row.taskName).toBe("テストタスク");
  });

  test("存在しない memberId は 400", async () => {
    const task = await insertTask(a.members[0]!.memberId);
    const res = await patch(a.leader.cookie, task.taskId, { productMemberId: crypto.randomUUID() });
    expect(res.status).toBe(400);
  });

  test("同じプロダクトの別メンバーに変更できる", async () => {
    const task = await insertTask(a.members[0]!.memberId);
    const res = await patch(a.leader.cookie, task.taskId, { productMemberId: a.members[1]!.memberId });
    expect(res.status).toBe(200);
    expect((await res.json()).productMemberId).toBe(a.members[1]!.memberId);
    expect((await findTask(task.taskId))!.productMemberId).toBe(a.members[1]!.memberId);
  });

  test("リーダー自身にも変更できる", async () => {
    const task = await insertTask(a.members[0]!.memberId);
    const res = await patch(a.leader.cookie, task.taskId, { productMemberId: a.leader.memberId });
    expect(res.status).toBe(200);
    expect((await findTask(task.taskId))!.productMemberId).toBe(a.leader.memberId);
  });
});

describe("taskTypeId", () => {
  test("body に含めても無視され、他の項目は更新される", async () => {
    const type = await createTaskType(a.productId);
    const other = await createTaskType(a.productId, "別");
    const task = await insertTask(a.members[0]!.memberId, { taskTypeId: type.taskTypeId });
    const res = await patch(a.leader.cookie, task.taskId, {
      taskTypeId: other.taskTypeId,
      taskName: "種類は変えない",
    });
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.taskTypeId).toBe(type.taskTypeId);
    const row = (await findTask(task.taskId))!;
    expect(row.taskTypeId).toBe(type.taskTypeId);
    expect(row.taskName).toBe("種類は変えない");
  });

  test("taskTypeId だけの body は変更項目なしとして 400", async () => {
    const type = await createTaskType(a.productId);
    const task = await insertTask(a.members[0]!.memberId);
    const res = await patch(a.leader.cookie, task.taskId, { taskTypeId: type.taskTypeId });
    expect(res.status).toBe(400);
    expect((await findTask(task.taskId))!.taskTypeId).toBeNull();
  });
});
