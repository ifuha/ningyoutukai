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

const patch = (
  cookie: string | undefined,
  productId: string,
  taskId: string,
  messageId: string,
  body?: unknown
) => request("PATCH", url(productId, taskId, messageId), { cookie, body });

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
  test("cookie なしは 401 で、本文は変わらない", async () => {
    const task = await insertTask(a.members[0]!.memberId);
    const msg = await insertMessage(task.taskId, a.members[0]!.memberId);
    const res = await patch(undefined, a.productId, task.taskId, msg.messageId, { body: "新" });
    expect(res.status).toBe(401);
    expect((await findMessage(msg.messageId))!.body).toBe("元の本文");
  });

  test("所属していないユーザーは 404", async () => {
    const outsider = await createOutsider();
    const task = await insertTask(a.members[0]!.memberId);
    const msg = await insertMessage(task.taskId, a.members[0]!.memberId);
    const res = await patch(outsider.cookie, a.productId, task.taskId, msg.messageId, { body: "新" });
    expect(res.status).toBe(404);
  });

  test("存在しないメッセージ、別のタスクのメッセージ、別プロダクトのタスクは 404", async () => {
    const t1 = await insertTask(a.members[0]!.memberId);
    const t2 = await insertTask(a.members[0]!.memberId);
    const msgOfT2 = await insertMessage(t2.taskId, a.members[0]!.memberId);
    const cookie = a.members[0]!.cookie;

    const missing = await patch(cookie, a.productId, t1.taskId, crypto.randomUUID(), { body: "新" });
    expect(missing.status).toBe(404);
    expect(await missing.json()).toEqual({ message: "メッセージが見つかりません" });

    // t2 のメッセージを、t1 の URL で指定する
    const wrongTask = await patch(cookie, a.productId, t1.taskId, msgOfT2.messageId, { body: "新" });
    expect(wrongTask.status).toBe(404);
    expect((await findMessage(msgOfT2.messageId))!.body).toBe("元の本文");

    const other = await insertTask(b.members[0]!.memberId);
    const otherMsg = await insertMessage(other.taskId, b.members[0]!.memberId);
    const crossProduct = await patch(a.leader.cookie, a.productId, other.taskId, otherMsg.messageId, {
      body: "新",
    });
    expect(crossProduct.status).toBe(404);
  });

  test("uuid でない taskId / messageId は 422", async () => {
    const task = await insertTask(a.members[0]!.memberId);
    const msg = await insertMessage(task.taskId, a.members[0]!.memberId);
    const cookie = a.members[0]!.cookie;
    expect((await patch(cookie, a.productId, "x", msg.messageId, { body: "新" })).status).toBe(422);
    expect((await patch(cookie, a.productId, task.taskId, "x", { body: "新" })).status).toBe(422);
  });

  test("見えない非公開タスクのメッセージは、担当者でもリーダーでもない人には 404", async () => {
    const task = await insertTask(a.members[0]!.memberId, { isVisible: false });
    const msg = await insertMessage(task.taskId, a.members[0]!.memberId);
    const res = await patch(a.members[1]!.cookie, a.productId, task.taskId, msg.messageId, { body: "新" });
    expect(res.status).toBe(404);
    expect((await findMessage(msg.messageId))!.body).toBe("元の本文");
  });

  test("ほかの人のメッセージは、リーダーでも 403 で、本文は変わらない", async () => {
    const task = await insertTask(a.members[0]!.memberId);
    const msg = await insertMessage(task.taskId, a.members[0]!.memberId);
    for (const who of [a.leader, a.members[1]!]) {
      const res = await patch(who.cookie, a.productId, task.taskId, msg.messageId, { body: "乗っ取り" });
      expect(res.status).toBe(403);
      expect(await res.json()).toEqual({ message: "自分のメッセージだけ編集できます" });
    }
    expect((await findMessage(msg.messageId))!.body).toBe("元の本文");
  });

  test("権限の確認が先: 本人でない人が空白だけを送っても 403", async () => {
    const task = await insertTask(a.members[0]!.memberId);
    const msg = await insertMessage(task.taskId, a.members[0]!.memberId);
    const res = await patch(a.leader.cookie, a.productId, task.taskId, msg.messageId, { body: "   " });
    expect(res.status).toBe(403);
  });
});

describe("編集できる", () => {
  test("本人は 200 で編集できる。本文と editedAt だけが変わる", async () => {
    const task = await insertTask(a.members[0]!.memberId);
    const msg = await insertMessage(task.taskId, a.members[0]!.memberId, {
      kind: "report",
      createdAt: new Date("2030-05-01T00:00:00.000Z"),
    });
    const res = await patch(a.members[0]!.cookie, a.productId, task.taskId, msg.messageId, {
      body: "直した本文",
    });
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(Object.keys(json).sort()).toEqual([
      "author",
      "body",
      "createdAt",
      "deleted",
      "editedAt",
      "kind",
      "messageId",
    ]);
    expect(json).toMatchObject({
      messageId: msg.messageId,
      kind: "report",
      body: "直した本文",
      createdAt: "2030-05-01T00:00:00.000Z",
      deleted: false,
    });
    expect(json.author).toMatchObject({
      productMemberId: a.members[0]!.memberId,
      userName: "member1",
    });
    expect(new Date(json.editedAt).toISOString()).toBe(json.editedAt);

    const row = (await findMessage(msg.messageId))!;
    expect(row).toMatchObject({
      body: "直した本文",
      kind: "report",
      authorMemberId: a.members[0]!.memberId,
      taskId: task.taskId,
      deletedAt: null,
    });
    expect(row.editedAt).not.toBeNull();
    expect(row.createdAt.toISOString()).toBe("2030-05-01T00:00:00.000Z");
  });

  test("編集が、履歴取得(GET)に反映される", async () => {
    const task = await insertTask(a.members[0]!.memberId);
    const msg = await insertMessage(task.taskId, a.members[0]!.memberId);
    await patch(a.members[0]!.cookie, a.productId, task.taskId, msg.messageId, { body: "反映" });
    const res = await request("GET", `/api/product/${a.productId}/task/${task.taskId}/message`, {
      cookie: a.leader.cookie,
    });
    const [row] = (await res.json()).messages;
    expect(row.body).toBe("反映");
    expect(row.editedAt).not.toBeNull();
  });

  test("リーダーは、自分のメッセージを編集できる(差し戻し・承認の種類も)", async () => {
    const task = await insertTask(a.members[0]!.memberId);
    for (const kind of ["comment", "reject", "approve"] as const) {
      const msg = await insertMessage(task.taskId, a.leader.memberId, { kind });
      const res = await patch(a.leader.cookie, a.productId, task.taskId, msg.messageId, {
        body: `${kind}を直した`,
      });
      expect(res.status).toBe(200);
      expect((await res.json()).kind).toBe(kind);
    }
  });

  test("本文が変わらなければ、editedAt は入らない", async () => {
    const task = await insertTask(a.members[0]!.memberId);
    const msg = await insertMessage(task.taskId, a.members[0]!.memberId, { body: "同じ" });
    const res = await patch(a.members[0]!.cookie, a.productId, task.taskId, msg.messageId, {
      body: "  同じ  ",
    });
    expect(res.status).toBe(200);
    expect((await res.json()).editedAt).toBeNull();
    expect((await findMessage(msg.messageId))!.editedAt).toBeNull();
  });

  test("種類・書いた人・日時・削除の印を、リクエストに入れても無視される", async () => {
    const task = await insertTask(a.members[0]!.memberId);
    const msg = await insertMessage(task.taskId, a.members[0]!.memberId, {
      createdAt: new Date("2030-06-01T00:00:00.000Z"),
    });
    const res = await patch(a.members[0]!.cookie, a.productId, task.taskId, msg.messageId, {
      body: "本文だけ",
      kind: "approve",
      authorMemberId: a.leader.memberId,
      createdAt: "2000-01-01T00:00:00.000Z",
      deletedAt: new Date().toISOString(),
    });
    expect(res.status).toBe(200);
    const row = (await findMessage(msg.messageId))!;
    expect(row).toMatchObject({
      body: "本文だけ",
      kind: "comment",
      authorMemberId: a.members[0]!.memberId,
      deletedAt: null,
    });
    expect(row.createdAt.toISOString()).toBe("2030-06-01T00:00:00.000Z");
  });

  test("ほかのメッセージは変わらない", async () => {
    const task = await insertTask(a.members[0]!.memberId);
    const target = await insertMessage(task.taskId, a.members[0]!.memberId, { body: "対象" });
    const sibling = await insertMessage(task.taskId, a.members[0]!.memberId, { body: "隣" });
    await patch(a.members[0]!.cookie, a.productId, task.taskId, target.messageId, { body: "変えた" });
    expect((await findMessage(sibling.messageId))!.body).toBe("隣");
  });

  test("同時に別の本文で 2 回編集しても、どちらかの本文で整合して 200", async () => {
    const task = await insertTask(a.members[0]!.memberId);
    const msg = await insertMessage(task.taskId, a.members[0]!.memberId);
    const [r1, r2] = await Promise.all([
      patch(a.members[0]!.cookie, a.productId, task.taskId, msg.messageId, { body: "A" }),
      patch(a.members[0]!.cookie, a.productId, task.taskId, msg.messageId, { body: "B" }),
    ]);
    expect(r1.status).toBe(200);
    expect(r2.status).toBe(200);
    expect(["A", "B"]).toContain((await findMessage(msg.messageId))!.body);
  });
});

describe("編集できない状態", () => {
  test("削除済みのメッセージは 409 で、本文は変わらない", async () => {
    const task = await insertTask(a.members[0]!.memberId);
    const msg = await insertMessage(task.taskId, a.members[0]!.memberId, {
      deletedAt: new Date(),
    });
    const res = await patch(a.members[0]!.cookie, a.productId, task.taskId, msg.messageId, { body: "新" });
    expect(res.status).toBe(409);
    expect(await res.json()).toEqual({ message: "削除済みのメッセージは編集できません" });
    expect((await findMessage(msg.messageId))!.body).toBe("元の本文");
  });

  test("完了済みのタスクのメッセージは 409 で、本文は変わらない", async () => {
    const task = await insertTask(a.members[0]!.memberId, { completedAt: new Date() });
    const msg = await insertMessage(task.taskId, a.members[0]!.memberId);
    const res = await patch(a.members[0]!.cookie, a.productId, task.taskId, msg.messageId, { body: "新" });
    expect(res.status).toBe(409);
    expect(await res.json()).toEqual({ message: "完了済みのタスクのメッセージは編集できません" });
    expect((await findMessage(msg.messageId))!.body).toBe("元の本文");
  });

  test("作業中・確認待ち・差し戻し中のタスクのメッセージは編集できる", async () => {
    for (const status of ["in_progress", "reported", "rejected"] as const) {
      const task = await insertTask(a.members[0]!.memberId, { status });
      const msg = await insertMessage(task.taskId, a.members[0]!.memberId);
      const res = await patch(a.members[0]!.cookie, a.productId, task.taskId, msg.messageId, {
        body: status,
      });
      expect(res.status).toBe(200);
    }
  });
});

describe("本文の検証", () => {
  test("前後の空白は取り除かれ、途中の空白と改行は保たれる", async () => {
    const task = await insertTask(a.members[0]!.memberId);
    const msg = await insertMessage(task.taskId, a.members[0]!.memberId);
    const res = await patch(a.members[0]!.cookie, a.productId, task.taskId, msg.messageId, {
      body: "  \u3000 一行目\n二行目  あり \t\n",
    });
    expect(res.status).toBe(200);
    expect((await res.json()).body).toBe("一行目\n二行目  あり");
  });

  test("コメントと差し戻しは、空・空白だけにできない(400)。本文は変わらない", async () => {
    const task = await insertTask(a.members[0]!.memberId);
    const comment = await insertMessage(task.taskId, a.members[0]!.memberId, { kind: "comment" });
    const reject = await insertMessage(task.taskId, a.leader.memberId, { kind: "reject" });
    for (const body of ["", "   ", "\u3000\u3000", "\t\n "]) {
      const r1 = await patch(a.members[0]!.cookie, a.productId, task.taskId, comment.messageId, { body });
      expect(r1.status).toBe(400);
      expect(await r1.json()).toEqual({ message: "本文を入力してください" });
      const r2 = await patch(a.leader.cookie, a.productId, task.taskId, reject.messageId, { body });
      expect(r2.status).toBe(400);
    }
    expect((await findMessage(comment.messageId))!.body).toBe("元の本文");
    expect((await findMessage(reject.messageId))!.body).toBe("元の本文");
  });

  test("報告・再提出・承認は、本文を空に戻せる(200)", async () => {
    const task = await insertTask(a.members[0]!.memberId);
    const cases = [
      { kind: "report" as const, author: a.members[0]! },
      { kind: "resubmit" as const, author: a.members[0]! },
      { kind: "approve" as const, author: a.leader },
    ];
    for (const c of cases) {
      const msg = await insertMessage(task.taskId, c.author.memberId, { kind: c.kind });
      const res = await patch(c.author.cookie, a.productId, task.taskId, msg.messageId, { body: "  " });
      expect(res.status).toBe(200);
      expect((await res.json()).body).toBe("");
      expect((await findMessage(msg.messageId))!.body).toBe("");
    }
  });

  test("body がない、型が違う、本文が配列・null・文字列は 422", async () => {
    const task = await insertTask(a.members[0]!.memberId);
    const msg = await insertMessage(task.taskId, a.members[0]!.memberId);
    for (const body of [{}, { body: 123 }, { body: null }, { body: ["x"] }, [], "x", null]) {
      const res = await patch(a.members[0]!.cookie, a.productId, task.taskId, msg.messageId, body);
      expect(res.status).toBe(422);
    }
    expect((await findMessage(msg.messageId))!.body).toBe("元の本文");
  });

  test("2000 文字ちょうどは 200、2001 文字は 422。上限は trim 前の長さで判定される", async () => {
    const task = await insertTask(a.members[0]!.memberId);
    const msg = await insertMessage(task.taskId, a.members[0]!.memberId);
    const cookie = a.members[0]!.cookie;
    expect(
      (await patch(cookie, a.productId, task.taskId, msg.messageId, { body: "あ".repeat(2000) })).status
    ).toBe(200);
    expect(
      (await patch(cookie, a.productId, task.taskId, msg.messageId, { body: "あ".repeat(2001) })).status
    ).toBe(422);
    expect(
      (await patch(cookie, a.productId, task.taskId, msg.messageId, { body: " " + "あ".repeat(2000) })).status
    ).toBe(422);
  });

  test("NUL 文字を含むと 422 で、500 にならず、本文は変わらない", async () => {
    const task = await insertTask(a.members[0]!.memberId);
    const msg = await insertMessage(task.taskId, a.members[0]!.memberId);
    for (const body of ["\u0000先頭", "途中\u0000です", "末尾\u0000"]) {
      const res = await patch(a.members[0]!.cookie, a.productId, task.taskId, msg.messageId, { body });
      expect(res.status).toBe(422);
    }
    expect((await findMessage(msg.messageId))!.body).toBe("元の本文");
  });
});