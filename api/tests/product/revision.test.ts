import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { eq } from "drizzle-orm";
import { app } from "../../src/app";
import { db } from "../../src/db";
import {
  productMembers,
  products,
  sections,
  taskMessages,
  tasks,
  taskTypes,
  users,
} from "../../src/db/schema";
import { computeProductRevision } from "../../src/routes/product-revision";
import {
  cleanup,
  createOutsider,
  createTaskType,
  insertTask,
  setupProduct,
} from "../task/helpers";

// GET /api/product/:productId/revision: 他の人の変更を検知するための「版」。
// 値は、プロダクトの画面が依存するデータの全行・全列の指紋。どこが変わっても変わり、変わらなければ同じ値になる

type Setup = Awaited<ReturnType<typeof setupProduct>>;
let a: Setup; // 検査の対象のプロダクト(リーダー + メンバー 2 人)
let b: Setup; // 別のプロダクト(a の版に影響しないことを確かめる)

beforeAll(async () => {
  a = await setupProduct();
  b = await setupProduct({ members: 1 });
});
afterAll(cleanup);

const get = (productId: string, cookie?: string) =>
  app.handle(
    new Request(`http://localhost/api/product/${productId}/revision`, {
      headers: cookie ? { cookie } : {},
    })
  );

async function revisionOf(productId: string, cookie: string) {
  const res = await get(productId, cookie);
  expect(res.status).toBe(200);
  const body = (await res.json()) as { revision: string };
  return body.revision;
}

describe("認証と存在の確認", () => {
  test("cookie なしは 401", async () => {
    expect((await get(a.productId)).status).toBe(401);
  });

  test("所属していないユーザーは 404(存在を漏らさない)", async () => {
    const outsider = await createOutsider();
    expect((await get(a.productId, outsider.cookie)).status).toBe(404);
  });

  test("存在しないプロダクトは 404", async () => {
    expect((await get(crypto.randomUUID(), a.leader.cookie)).status).toBe(404);
  });

  test("uuid でない productId は 422", async () => {
    expect((await get("x", a.leader.cookie)).status).toBe(422);
  });

  test("リーダーも、メンバーも読める", async () => {
    expect((await get(a.productId, a.leader.cookie)).status).toBe(200);
    expect((await get(a.productId, a.members[0]!.cookie)).status).toBe(200);
  });
});

describe("応答", () => {
  test("32 桁の 16 進数の文字列。キャッシュさせない", async () => {
    const res = await get(a.productId, a.leader.cookie);
    const body = (await res.json()) as { revision: string };
    expect(body.revision).toMatch(/^[0-9a-f]{32}$/);
    expect(res.headers.get("cache-control")).toBe("no-store");
  });

  test("変更がなければ、何度呼んでも同じ値(リーダーとメンバーでも同じ)", async () => {
    const r1 = await revisionOf(a.productId, a.leader.cookie);
    const r2 = await revisionOf(a.productId, a.leader.cookie);
    const r3 = await revisionOf(a.productId, a.members[0]!.cookie);
    expect(r2).toBe(r1);
    expect(r3).toBe(r1);
  });

  test("プロダクトごとに違う値", async () => {
    expect(await revisionOf(a.productId, a.leader.cookie)).not.toBe(
      await revisionOf(b.productId, b.leader.cookie)
    );
  });
});

describe("どこが変わっても、値が変わる", () => {
  /** fn で何かを変えて、版が変わったことを確かめる。変える前の版を返す */
  async function changes(label: string, fn: () => Promise<unknown>) {
    const before = await revisionOf(a.productId, a.leader.cookie);
    await fn();
    const after = await revisionOf(a.productId, a.leader.cookie);
    expect({ label, changed: after !== before }).toEqual({ label, changed: true });
    return after;
  }

  test("タスクの追加・更新・削除", async () => {
    let task!: Awaited<ReturnType<typeof insertTask>>;
    await changes("追加", async () => {
      task = await insertTask(a.members[0]!.memberId);
    });
    await changes("名前の更新", () =>
      db.update(tasks).set({ taskName: "名前を変えた" }).where(eq(tasks.taskId, task.taskId))
    );
    await changes("非公開にする", () =>
      db.update(tasks).set({ isVisible: false }).where(eq(tasks.taskId, task.taskId))
    );
    await changes("削除", () => db.delete(tasks).where(eq(tasks.taskId, task.taskId)));
  });

  test("追加して、すぐ別のタスクを消して、件数が同じでも、値は変わる(件数や最大日時ではない)", async () => {
    const t1 = await insertTask(a.members[0]!.memberId, { taskName: "いっこめ" });
    const before = await revisionOf(a.productId, a.leader.cookie);
    await db.delete(tasks).where(eq(tasks.taskId, t1.taskId));
    await insertTask(a.members[0]!.memberId, { taskName: "にこめ" });
    expect(await revisionOf(a.productId, a.leader.cookie)).not.toBe(before);
  });

  test("タスクの種類の追加", async () => {
    await changes("種類", () => createTaskType(a.productId, "新しい種類"));
  });

  test("メッセージの追加", async () => {
    const task = await insertTask(a.members[0]!.memberId);
    await changes("メッセージ", () =>
      db
        .insert(taskMessages)
        .values({ taskId: task.taskId, authorMemberId: a.members[0]!.memberId, kind: "comment", body: "こんにちは" })
    );
  });

  test("セクションの追加と、メンバーの所属・位置の変更", async () => {
    let sectionId!: string;
    await changes("セクション", async () => {
      const [row] = await db
        .insert(sections)
        .values({ productId: a.productId, sectionName: "新しいセクション", color: "red", x: 0, y: 0, width: 200, height: 200 })
        .returning();
      sectionId = row!.sectionId;
    });
    await changes("所属と位置", () =>
      db
        .update(productMembers)
        .set({ sectionId, positionX: 10, positionY: 20 })
        .where(eq(productMembers.productMemberId, a.members[1]!.memberId))
    );
    await changes("位置だけ", () =>
      db
        .update(productMembers)
        .set({ positionX: 30 })
        .where(eq(productMembers.productMemberId, a.members[1]!.memberId))
    );
  });

  test("プロダクト名の変更", async () => {
    await changes("名前", () =>
      db.update(products).set({ productName: `renamed-${crypto.randomUUID().slice(0, 6)}` }).where(eq(products.productId, a.productId))
    );
  });

  test("メンバーのユーザー情報(名前)の変更", async () => {
    await changes("ユーザー名", () =>
      db.update(users).set({ userName: "名前を変えた人" }).where(eq(users.userId, a.members[0]!.userId))
    );
  });

  test("元の値に戻すと、版も元に戻る(履歴ではなく、いまのデータの指紋)", async () => {
    const task = await insertTask(a.members[0]!.memberId, { taskName: "元の名前" });
    const before = await revisionOf(a.productId, a.leader.cookie);
    await db.update(tasks).set({ taskName: "別の名前" }).where(eq(tasks.taskId, task.taskId));
    expect(await revisionOf(a.productId, a.leader.cookie)).not.toBe(before);
    await db.update(tasks).set({ taskName: "元の名前" }).where(eq(tasks.taskId, task.taskId));
    expect(await revisionOf(a.productId, a.leader.cookie)).toBe(before);
  });
});

describe("ほかのプロダクトの変更では、変わらない", () => {
  test("別のプロダクトのタスク・種類・メンバーの変更では、値が変わらない", async () => {
    const before = await revisionOf(a.productId, a.leader.cookie);
    await insertTask(b.members[0]!.memberId);
    await createTaskType(b.productId, "ほかの種類");
    await db.update(users).set({ userName: "ほかの人" }).where(eq(users.userId, b.members[0]!.userId));
    await db.update(taskTypes).set({ taskTypeName: `x-${crypto.randomUUID().slice(0, 6)}` }).where(eq(taskTypes.productId, b.productId));
    expect(await revisionOf(a.productId, a.leader.cookie)).toBe(before);
  });
});

describe("computeProductRevision", () => {
  test("API と同じ値を返す", async () => {
    expect(await computeProductRevision(a.productId)).toBe(await revisionOf(a.productId, a.leader.cookie));
  });

  test("メンバーもタスクもない(存在しない)プロダクトでも、例外を出さない", async () => {
    expect(await computeProductRevision(crypto.randomUUID())).toMatch(/^[0-9a-f]{32}$/);
  });
});
