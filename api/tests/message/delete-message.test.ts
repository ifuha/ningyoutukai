import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { eq } from "drizzle-orm";
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

const url = (productId: string, taskId: string, messageId: string) =>
  `/api/product/${productId}/task/${taskId}/message/${messageId}`;

const del = (cookie: string | undefined, productId: string, taskId: string, messageId: string) =>
  request("DELETE", url(productId, taskId, messageId), { cookie });

/** メッセージを DB に直接入れる */
async function insertMessage(
  taskId: string,
  authorMemberId: string,
  values: Partial<typeof taskMessages.$inferInsert> = {}
) {
  const [row] = await db
    .insert(taskMessages)
    .values({ taskId, authorMemberId, kind: "comment", body: "元の本文", ...values })
    .returning();
  return row;
}

async function findMessage(messageId: string) {
  const [row] = await db.select().from(taskMessages).where(eq(taskMessages.messageId, messageId));
  return row;
}

describe("認証・存在・権限", () => {
  test("cookie なしは 401 で、削除されない", async () => {
    const task = await insertTask(a.members[0]!.memberId);
    const msg = await insertMessage(task.taskId, a.members[0]!.memberId);
    const res = await del(undefined, a.productId, task.taskId, msg.messageId);
    expect(res.status).toBe(401);
    expect((await findMessage(msg.messageId))!.deletedAt).toBeNull();
  });

  test("所属していないユーザーは 404", async () => {
    const outsider = await createOutsider();
    const task = await insertTask(a.members[0]!.memberId);
    const msg = await insertMessage(task.taskId, a.members[0]!.memberId);
    const res = await del(outsider.cookie, a.productId, task.taskId, msg.messageId);
    expect(res.status).toBe(404);
    expect((await findMessage(msg.messageId))!.deletedAt).toBeNull();
  });

  test("存在しないメッセージ、別のタスクのメッセージ、別プロダクトのタスクは 404", async () => {
    const t1 = await insertTask(a.members[0]!.memberId);
    const t2 = await insertTask(a.members[0]!.memberId);
    const msgOfT2 = await insertMessage(t2.taskId, a.members[0]!.memberId);
    const cookie = a.members[0]!.cookie;

    const missing = await del(cookie, a.productId, t1.taskId, crypto.randomUUID());
    expect(missing.status).toBe(404);
    expect(await missing.json()).toEqual({ message: "メッセージが見つかりません" });

    // t2 のメッセージを、t1 の URL で指定する
    const wrongTask = await del(cookie, a.productId, t1.taskId, msgOfT2.messageId);
    expect(wrongTask.status).toBe(404);
    expect((await findMessage(msgOfT2.messageId))!.deletedAt).toBeNull();

    const other = await insertTask(b.members[0]!.memberId);
    const otherMsg = await insertMessage(other.taskId, b.members[0]!.memberId);
    const crossProduct = await del(a.leader.cookie, a.productId, other.taskId, otherMsg.messageId);
    expect(crossProduct.status).toBe(404);
    expect((await findMessage(otherMsg.messageId))!.deletedAt).toBeNull();
  });

  test("uuid でない taskId / messageId は 422", async () => {
    const task = await insertTask(a.members[0]!.memberId);
    const msg = await insertMessage(task.taskId, a.members[0]!.memberId);
    const cookie = a.members[0]!.cookie;
    expect((await del(cookie, a.productId, "x", msg.messageId)).status).toBe(422);
    expect((await del(cookie, a.productId, task.taskId, "x")).status).toBe(422);
  });

  test("見えない非公開タスクのメッセージは、担当者でもリーダーでもない人には 404", async () => {
    const task = await insertTask(a.members[0]!.memberId, { isVisible: false });
    const msg = await insertMessage(task.taskId, a.members[0]!.memberId);
    const res = await del(a.members[1]!.cookie, a.productId, task.taskId, msg.messageId);
    expect(res.status).toBe(404);
    expect((await findMessage(msg.messageId))!.deletedAt).toBeNull();
  });

  test("書いた本人でもリーダーでもない人は 403 で、削除されない(担当者でも、他人のコメントは消せない)", async () => {
    const task = await insertTask(a.members[0]!.memberId, { isVisible: true });
    const byLeader = await insertMessage(task.taskId, a.leader.memberId);
    const res1 = await del(a.members[0]!.cookie, a.productId, task.taskId, byLeader.messageId);
    expect(res1.status).toBe(403);
    expect(await res1.json()).toEqual({ message: "自分のメッセージか、リーダーのみ削除できます" });

    const byAssignee = await insertMessage(task.taskId, a.members[0]!.memberId);
    const res2 = await del(a.members[1]!.cookie, a.productId, task.taskId, byAssignee.messageId);
    expect(res2.status).toBe(403);

    expect((await findMessage(byLeader.messageId))!.deletedAt).toBeNull();
    expect((await findMessage(byAssignee.messageId))!.deletedAt).toBeNull();
  });

  test("権限の確認が先: 本人でもリーダーでもない人が、報告を消そうとしても 403(409 ではない)", async () => {
    const task = await insertTask(a.members[0]!.memberId);
    const report = await insertMessage(task.taskId, a.members[0]!.memberId, { kind: "report" });
    const res = await del(a.members[1]!.cookie, a.productId, task.taskId, report.messageId);
    expect(res.status).toBe(403);
  });
});

describe("削除できる", () => {
  test("本人は 204 で削除できる。本文なし、JSON の Content-Type も付かない", async () => {
    const task = await insertTask(a.members[0]!.memberId);
    const msg = await insertMessage(task.taskId, a.members[0]!.memberId, { body: "消す本文" });
    const res = await del(a.members[0]!.cookie, a.productId, task.taskId, msg.messageId);
    expect(res.status).toBe(204);
    expect(await res.text()).toBe("");
    expect(res.headers.get("content-type") ?? "").not.toContain("json");
  });

  test("論理削除: 行は残り、本文は空になり、deletedAt が入る。ほかの項目は変わらない", async () => {
    const task = await insertTask(a.members[0]!.memberId);
    const msg = await insertMessage(task.taskId, a.members[0]!.memberId, {
      body: "消す本文",
      createdAt: new Date("2030-07-01T00:00:00.000Z"),
    });
    await del(a.members[0]!.cookie, a.productId, task.taskId, msg.messageId);
    const row = (await findMessage(msg.messageId))!;
    expect(row).toMatchObject({
      messageId: msg.messageId,
      taskId: task.taskId,
      authorMemberId: a.members[0]!.memberId,
      kind: "comment",
      body: "",
      editedAt: null,
    });
    expect(row.deletedAt).not.toBeNull();
    expect(row.createdAt.toISOString()).toBe("2030-07-01T00:00:00.000Z");
  });

  test("削除が、履歴取得(GET)に反映される。元の本文は返らず、並びも変わらない", async () => {
    const task = await insertTask(a.members[0]!.memberId);
    const m = a.members[0]!.memberId;
    await insertMessage(task.taskId, m, { body: "1番目", createdAt: new Date("2030-08-01T00:00:00Z") });
    const target = await insertMessage(task.taskId, m, {
      body: "消す本文",
      createdAt: new Date("2030-08-02T00:00:00Z"),
    });
    await insertMessage(task.taskId, m, { body: "3番目", createdAt: new Date("2030-08-03T00:00:00Z") });
    await del(a.members[0]!.cookie, a.productId, task.taskId, target.messageId);

    const res = await request("GET", `/api/product/${a.productId}/task/${task.taskId}/message`, {
      cookie: a.leader.cookie,
    });
    const messages = (await res.json()).messages;
    expect(messages.map((x: { deleted: boolean }) => x.deleted)).toEqual([false, true, false]);
    expect(messages[1].body).toBe("");
    expect(JSON.stringify(messages)).not.toContain("消す本文");
  });

  test("リーダーは、ほかの人のコメントも、自分のコメントも削除できる(非公開タスクでも)", async () => {
    const task = await insertTask(a.members[0]!.memberId, { isVisible: false });
    const others = await insertMessage(task.taskId, a.members[0]!.memberId);
    const own = await insertMessage(task.taskId, a.leader.memberId);
    expect((await del(a.leader.cookie, a.productId, task.taskId, others.messageId)).status).toBe(204);
    expect((await del(a.leader.cookie, a.productId, task.taskId, own.messageId)).status).toBe(204);
  });

  test("ほかのメッセージは変わらない", async () => {
    const task = await insertTask(a.members[0]!.memberId);
    const target = await insertMessage(task.taskId, a.members[0]!.memberId, { body: "対象" });
    const sibling = await insertMessage(task.taskId, a.members[0]!.memberId, { body: "隣" });
    const otherTask = await insertTask(a.members[0]!.memberId);
    const unrelated = await insertMessage(otherTask.taskId, a.members[0]!.memberId, { body: "別タスク" });
    await del(a.members[0]!.cookie, a.productId, task.taskId, target.messageId);
    expect(await findMessage(sibling.messageId)).toMatchObject({ body: "隣", deletedAt: null });
    expect(await findMessage(unrelated.messageId)).toMatchObject({ body: "別タスク", deletedAt: null });
  });

  test("作業中・確認待ち・差し戻し中のタスクのコメントは削除できる", async () => {
    for (const status of ["in_progress", "reported", "rejected"] as const) {
      const task = await insertTask(a.members[0]!.memberId, { status });
      const msg = await insertMessage(task.taskId, a.members[0]!.memberId);
      const res = await del(a.members[0]!.cookie, a.productId, task.taskId, msg.messageId);
      expect(res.status).toBe(204);
    }
  });

  test("同時に 2 回削除しても、204 が 1 回と 409 が 1 回", async () => {
    const task = await insertTask(a.members[0]!.memberId);
    const msg = await insertMessage(task.taskId, a.members[0]!.memberId);
    const rs = await Promise.all([
      del(a.members[0]!.cookie, a.productId, task.taskId, msg.messageId),
      del(a.leader.cookie, a.productId, task.taskId, msg.messageId),
    ]);
    expect(rs.map((r) => r.status).sort()).toEqual([204, 409]);
    expect((await findMessage(msg.messageId))!.deletedAt).not.toBeNull();
  });
});

describe("削除できない状態", () => {
  test("コメント以外(報告・再提出・差し戻し・承認)は 409 で、本人でもリーダーでも削除できない", async () => {
    const task = await insertTask(a.members[0]!.memberId);
    const cases = [
      { kind: "report" as const, author: a.members[0]! },
      { kind: "resubmit" as const, author: a.members[0]! },
      { kind: "reject" as const, author: a.leader },
      { kind: "approve" as const, author: a.leader },
    ];
    for (const c of cases) {
      const msg = await insertMessage(task.taskId, c.author.memberId, { kind: c.kind, body: c.kind });
      for (const who of [c.author, a.leader]) {
        const res = await del(who.cookie, a.productId, task.taskId, msg.messageId);
        expect(res.status).toBe(409);
        expect(await res.json()).toEqual({ message: "コメント以外のメッセージは削除できません" });
      }
      expect(await findMessage(msg.messageId)).toMatchObject({ body: c.kind, deletedAt: null });
    }
  });

  test("削除済みのメッセージは、もう一度削除できない(409)。削除の日時は変わらない", async () => {
    const task = await insertTask(a.members[0]!.memberId);
    const deletedAt = new Date("2030-09-01T00:00:00.000Z");
    const msg = await insertMessage(task.taskId, a.members[0]!.memberId, { body: "", deletedAt });
    const res = await del(a.members[0]!.cookie, a.productId, task.taskId, msg.messageId);
    expect(res.status).toBe(409);
    expect(await res.json()).toEqual({ message: "すでに削除されています" });
    expect((await findMessage(msg.messageId))!.deletedAt!.toISOString()).toBe(deletedAt.toISOString());
  });

  test("完了済みのタスクのメッセージは 409 で、削除されない", async () => {
    const task = await insertTask(a.members[0]!.memberId, { completedAt: new Date() });
    const msg = await insertMessage(task.taskId, a.members[0]!.memberId, { body: "残る本文" });
    for (const who of [a.members[0]!, a.leader]) {
      const res = await del(who.cookie, a.productId, task.taskId, msg.messageId);
      expect(res.status).toBe(409);
      expect(await res.json()).toEqual({ message: "完了済みのタスクのメッセージは削除できません" });
    }
    expect(await findMessage(msg.messageId)).toMatchObject({ body: "残る本文", deletedAt: null });
  });
});