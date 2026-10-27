import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { db } from "../../src/db";
import { taskMessages } from "../../src/db/schema";
import {
  cleanup,
  createOutsider,
  insertTask,
  request,
  setupProduct,
} from "../task/helpers";

type Setup = Awaited<ReturnType<typeof setupProduct>>;
let a: Setup; // 検査の対象のプロダクト(リーダー + メンバー 2 人)
let b: Setup; // 別のプロダクト

beforeAll(async () => {
  a = await setupProduct();
  b = await setupProduct({ members: 1 });
});
afterAll(cleanup);

const url = (productId: string, taskId: string) =>
  `/api/product/${productId}/task/${taskId}/message`;

/** メッセージを DB に直接入れる(コメント追加の API はまだ無い) */
async function insertMessage(
  taskId: string,
  authorMemberId: string,
  values: Partial<typeof taskMessages.$inferInsert> = {}
) {
  const [row] = await db
    .insert(taskMessages)
    .values({ taskId, authorMemberId, kind: "comment", body: "本文", ...values })
    .returning();
  return row;
}

describe("認証と存在の確認", () => {
  test("cookie なしは 401", async () => {
    const task = await insertTask(a.members[0]!.memberId);
    expect((await request("GET", url(a.productId, task.taskId))).status).toBe(401);
  });

  test("所属していないユーザーは 404", async () => {
    const outsider = await createOutsider();
    const task = await insertTask(a.members[0]!.memberId);
    const res = await request("GET", url(a.productId, task.taskId), { cookie: outsider.cookie });
    expect(res.status).toBe(404);
  });

  test("存在しないタスクは 404、別プロダクトのタスクも 404", async () => {
    const missing = await request("GET", url(a.productId, crypto.randomUUID()), {
      cookie: a.leader.cookie,
    });
    expect(missing.status).toBe(404);

    const other = await insertTask(b.members[0]!.memberId);
    const res = await request("GET", url(a.productId, other.taskId), { cookie: a.leader.cookie });
    expect(res.status).toBe(404);
  });

  test("uuid でない taskId は 422", async () => {
    const res = await request("GET", url(a.productId, "x"), { cookie: a.leader.cookie });
    expect(res.status).toBe(422);
  });
});

describe("見える人", () => {
  test("公開タスクは、リーダー・担当者・ほかのメンバーが読める", async () => {
    const task = await insertTask(a.members[0]!.memberId, { isVisible: true });
    await insertMessage(task.taskId, a.members[0]!.memberId);
    for (const who of [a.leader, a.members[0]!, a.members[1]!]) {
      const res = await request("GET", url(a.productId, task.taskId), { cookie: who.cookie });
      expect(res.status).toBe(200);
      expect((await res.json()).messages).toHaveLength(1);
    }
  });

  test("非公開タスクは、リーダーと担当者だけ読める。ほかのメンバーは 404", async () => {
    const task = await insertTask(a.members[0]!.memberId, { isVisible: false });
    await insertMessage(task.taskId, a.members[0]!.memberId);
    expect(
      (await request("GET", url(a.productId, task.taskId), { cookie: a.leader.cookie })).status
    ).toBe(200);
    expect(
      (await request("GET", url(a.productId, task.taskId), { cookie: a.members[0]!.cookie })).status
    ).toBe(200);
    const other = await request("GET", url(a.productId, task.taskId), {
      cookie: a.members[1]!.cookie,
    });
    expect(other.status).toBe(404);
  });
});

describe("履歴の中身", () => {
  test("メッセージがなければ空の配列", async () => {
    const task = await insertTask(a.members[0]!.memberId);
    const res = await request("GET", url(a.productId, task.taskId), { cookie: a.leader.cookie });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ messages: [] });
  });

  test("古い順に返る(入れた順ではなく createdAt の順)", async () => {
    const task = await insertTask(a.members[0]!.memberId);
    const m = a.members[0]!.memberId;
    const newest = await insertMessage(task.taskId, m, {
      body: "3番目",
      createdAt: new Date("2030-01-03T00:00:00Z"),
    });
    const oldest = await insertMessage(task.taskId, m, {
      body: "1番目",
      createdAt: new Date("2030-01-01T00:00:00Z"),
    });
    const middle = await insertMessage(task.taskId, a.leader.memberId, {
      body: "2番目",
      createdAt: new Date("2030-01-02T00:00:00Z"),
    });
    const res = await request("GET", url(a.productId, task.taskId), { cookie: a.leader.cookie });
    const ids = (await res.json()).messages.map((x: { messageId: string }) => x.messageId);
    expect(ids).toEqual([oldest.messageId, middle.messageId, newest.messageId]);
  });

  test("応答の形: キー、書いた人、日時は ISO 文字列、編集していなければ editedAt は null", async () => {
    const task = await insertTask(a.members[0]!.memberId);
    const msg = await insertMessage(task.taskId, a.members[0]!.memberId, {
      kind: "report",
      body: "実装しました",
      createdAt: new Date("2030-02-01T01:02:03.000Z"),
    });
    const res = await request("GET", url(a.productId, task.taskId), { cookie: a.leader.cookie });
    const [row] = (await res.json()).messages;
    expect(Object.keys(row).sort()).toEqual([
      "author",
      "body",
      "createdAt",
      "deleted",
      "editedAt",
      "kind",
      "messageId",
    ]);
    expect(Object.keys(row.author).sort()).toEqual(["avatarUrl", "productMemberId", "userName"]);
    expect(row).toMatchObject({
      messageId: msg.messageId,
      kind: "report",
      body: "実装しました",
      createdAt: "2030-02-01T01:02:03.000Z",
      editedAt: null,
      deleted: false,
    });
    expect(row.author).toMatchObject({
      productMemberId: a.members[0]!.memberId,
      userName: "member1",
      avatarUrl: null,
    });
  });

  test("編集済みのメッセージは editedAt が入る", async () => {
    const task = await insertTask(a.members[0]!.memberId);
    await insertMessage(task.taskId, a.members[0]!.memberId, {
      editedAt: new Date("2030-03-01T00:00:00.000Z"),
    });
    const res = await request("GET", url(a.productId, task.taskId), { cookie: a.leader.cookie });
    expect((await res.json()).messages[0].editedAt).toBe("2030-03-01T00:00:00.000Z");
  });

  test("削除済みは、本文を空にして deleted: true で返り、並びは変わらない", async () => {
    const task = await insertTask(a.members[0]!.memberId);
    const m = a.members[0]!.memberId;
    await insertMessage(task.taskId, m, {
      body: "1番目",
      createdAt: new Date("2030-04-01T00:00:00Z"),
    });
    // 本文が DB に残っていても、返さないこと
    await insertMessage(task.taskId, m, {
      body: "消した本文",
      createdAt: new Date("2030-04-02T00:00:00Z"),
      deletedAt: new Date("2030-04-03T00:00:00Z"),
    });
    await insertMessage(task.taskId, m, {
      body: "3番目",
      createdAt: new Date("2030-04-04T00:00:00Z"),
    });
    const res = await request("GET", url(a.productId, task.taskId), { cookie: a.leader.cookie });
    const messages = (await res.json()).messages;
    expect(messages.map((x: { deleted: boolean }) => x.deleted)).toEqual([false, true, false]);
    expect(messages[1].body).toBe("");
    expect(JSON.stringify(messages)).not.toContain("消した本文");
  });

  test("ほかのタスクのメッセージは混ざらない", async () => {
    const t1 = await insertTask(a.members[0]!.memberId);
    const t2 = await insertTask(a.members[0]!.memberId);
    await insertMessage(t1.taskId, a.members[0]!.memberId, { body: "t1" });
    await insertMessage(t2.taskId, a.members[0]!.memberId, { body: "t2" });
    const res = await request("GET", url(a.productId, t1.taskId), { cookie: a.leader.cookie });
    const bodies = (await res.json()).messages.map((x: { body: string }) => x.body);
    expect(bodies).toEqual(["t1"]);
  });

  test("完了済みのタスクでも、履歴は読める", async () => {
    const task = await insertTask(a.members[0]!.memberId, { completedAt: new Date() });
    await insertMessage(task.taskId, a.members[0]!.memberId);
    const res = await request("GET", url(a.productId, task.taskId), { cookie: a.leader.cookie });
    expect(res.status).toBe(200);
    expect((await res.json()).messages).toHaveLength(1);
  });
});