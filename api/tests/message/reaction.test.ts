import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { eq } from "drizzle-orm";
import { db } from "../../src/db";
import { taskMessageReactions, taskMessages, tasks } from "../../src/db/schema";
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
  `/api/product/${productId}/task/${taskId}/message/${messageId}/reaction`;

const reactionUrl = (productId: string, taskId: string) =>
  `/api/product/${productId}/task/${taskId}/message`;

/** コメントを 1 件作って messageId を返す */
async function makeComment(productId: string, taskId: string, cookie: string) {
  const res = await request("POST", reactionUrl(productId, taskId), {
    cookie,
    body: { body: "テスト用のコメント" },
  });
  expect(res.status).toBe(201);
  return (await res.json()).messageId as string;
}

const press = (
  productId: string,
  taskId: string,
  messageId: string,
  cookie: string | undefined,
  emoji: string,
) => request("POST", url(productId, taskId, messageId), { cookie, body: { emoji } });

/** 指定した絵文字のリアクションを外す(消すのは、その絵文字だけ) */
const unpress = (
  productId: string,
  taskId: string,
  messageId: string,
  cookie: string | undefined,
  emoji: string,
) => request("DELETE", url(productId, taskId, messageId), { cookie, query: { emoji } });

const rowsOf = (messageId: string) =>
  db.select().from(taskMessageReactions).where(eq(taskMessageReactions.messageId, messageId));

describe("リアクションの API", () => {
  describe("認証・存在確認", () => {
    test("cookie なしは 401", async () => {
      const task = await insertTask(a.members[0]!.memberId);
      const messageId = await makeComment(a.productId, task.taskId, a.members[0]!.cookie);
      const res = await press(a.productId, task.taskId, messageId, undefined, "👍");
      expect(res.status).toBe(401);
      expect(await rowsOf(messageId)).toHaveLength(0);
    });

    test("所属していないユーザーは 404", async () => {
      const task = await insertTask(a.members[0]!.memberId);
      const messageId = await makeComment(a.productId, task.taskId, a.members[0]!.cookie);
      const outsider = await createOutsider();
      const res = await press(a.productId, task.taskId, messageId, outsider.cookie, "👍");
      expect(res.status).toBe(404);
      expect(await rowsOf(messageId)).toHaveLength(0);
    });

    test("別プロダクトのタスク・存在しないメッセージは 404", async () => {
      const other = await insertTask(b.members[0]!.memberId);
      const otherMessageId = await makeComment(b.productId, other.taskId, b.members[0]!.cookie);
      const res = await press(a.productId, other.taskId, otherMessageId, a.leader.cookie, "👍");
      expect(res.status).toBe(404);

      const task = await insertTask(a.members[0]!.memberId);
      const messageId = await makeComment(a.productId, task.taskId, a.members[0]!.cookie);
      const missing = await press(a.productId, task.taskId, crypto.randomUUID(), a.leader.cookie, "👍");
      expect(missing.status).toBe(404);
      expect(await rowsOf(messageId)).toHaveLength(0);
    });

    test("uuid でないメッセージ ID は 422", async () => {
      const task = await insertTask(a.members[0]!.memberId);
      const res = await press(a.productId, task.taskId, "x", a.leader.cookie, "👍");
      expect(res.status).toBe(422);
    });
  });

  describe("押せる人・押せる絵文字", () => {
    test("公開タスクでも、リーダーと担当者以外は 403", async () => {
      const task = await insertTask(a.members[0]!.memberId, { isVisible: true });
      const messageId = await makeComment(a.productId, task.taskId, a.members[0]!.cookie);
      const res = await press(a.productId, task.taskId, messageId, a.members[1]!.cookie, "👍");
      expect(res.status).toBe(403);
      expect(await res.json()).toEqual({ message: "リーダーと担当者のみリアクションを付けられます" });
      expect(await rowsOf(messageId)).toHaveLength(0);
    });

    test("5 個以外の絵文字は 422(欠けても 422)", async () => {
      const task = await insertTask(a.members[0]!.memberId);
      const messageId = await makeComment(a.productId, task.taskId, a.members[0]!.cookie);
      for (const emoji of ["🚀", "thumb", "", "👍👍"]) {
        const res = await press(a.productId, task.taskId, messageId, a.members[0]!.cookie, emoji);
        expect(res.status).toBe(422);
      }
      expect(await rowsOf(messageId)).toHaveLength(0);
    });

    test("完了済みのタスクは 409", async () => {
      const task = await insertTask(a.members[0]!.memberId);
      const messageId = await makeComment(a.productId, task.taskId, a.members[0]!.cookie);
      // コメントを書いたあとに完了にする(完了済みにはコメントも書けない)
      await db
        .update(tasks)
        .set({ status: "completed", completedAt: new Date() })
        .where(eq(tasks.taskId, task.taskId));
      const res = await press(a.productId, task.taskId, messageId, a.members[0]!.cookie, "👍");
      expect(res.status).toBe(409);
      expect(await rowsOf(messageId)).toHaveLength(0);
    });

    test("削除済みのメッセージには付けられない(409)", async () => {
      const task = await insertTask(a.members[0]!.memberId);
      const messageId = await makeComment(a.productId, task.taskId, a.members[0]!.cookie);
      const del = await request("DELETE", `${reactionUrl(a.productId, task.taskId)}/${messageId}`, {
        cookie: a.members[0]!.cookie,
      });
      expect(del.status).toBe(204);
      const res = await press(a.productId, task.taskId, messageId, a.leader.cookie, "👍");
      expect(res.status).toBe(409);
      expect(await rowsOf(messageId)).toHaveLength(0);
    });
  });

  describe("押す・取り消す", () => {
    test("担当者とリーダーが押せ、絵文字ごとにまとめて返る", async () => {
      const task = await insertTask(a.members[0]!.memberId);
      const messageId = await makeComment(a.productId, task.taskId, a.members[0]!.cookie);

      const first = await press(a.productId, task.taskId, messageId, a.members[0]!.cookie, "👍");
      expect(first.status).toBe(200);
      expect(await first.json()).toEqual({
        reactions: [
          {
            emoji: "👍",
            members: [{ productMemberId: a.members[0]!.memberId, userName: "member1", avatarUrl: null }],
          },
        ],
      });

      const second = await press(a.productId, task.taskId, messageId, a.leader.cookie, "👍");
      expect(second.status).toBe(200);
      const body = await second.json();
      expect(body.reactions).toHaveLength(1);
      expect(body.reactions[0].emoji).toBe("👍");
      expect(body.reactions[0].members.map((m: { productMemberId: string }) => m.productMemberId).sort()).toEqual(
        [a.members[0]!.memberId, a.leader.memberId].sort(),
      );
      expect(await rowsOf(messageId)).toHaveLength(2);
    });

    test("同じ人が別の絵文字も押せる(違う絵文字は 2 件残る)", async () => {
      const task = await insertTask(a.members[0]!.memberId);
      const messageId = await makeComment(a.productId, task.taskId, a.members[0]!.cookie);
      await press(a.productId, task.taskId, messageId, a.members[0]!.cookie, "👍");
      const res = await press(a.productId, task.taskId, messageId, a.members[0]!.cookie, "🎉");
      expect(res.status).toBe(200);
      const stored = await rowsOf(messageId);
      expect(stored.map((r) => r.emoji).sort()).toEqual(["👍", "🎉"].sort());
      expect((await res.json()).reactions.map((r: { emoji: string }) => r.emoji)).toEqual(["👍", "🎉"]);
    });

    test("同じ絵文字をもう一度押すと、1 件だけ残る(同じ人による二重登録は主キーで防ぐ)", async () => {
      const task = await insertTask(a.members[0]!.memberId);
      const messageId = await makeComment(a.productId, task.taskId, a.members[0]!.cookie);
      await press(a.productId, task.taskId, messageId, a.members[0]!.cookie, "👍");
      await press(a.productId, task.taskId, messageId, a.members[0]!.cookie, "👍");
      expect(await rowsOf(messageId)).toHaveLength(1);
    });

    test("DELETE で自分のリアクションだけが消える", async () => {
      const task = await insertTask(a.members[0]!.memberId);
      const messageId = await makeComment(a.productId, task.taskId, a.members[0]!.cookie);
      await press(a.productId, task.taskId, messageId, a.members[0]!.cookie, "👍");
      await press(a.productId, task.taskId, messageId, a.leader.cookie, "👍");

      const res = await unpress(a.productId, task.taskId, messageId, a.members[0]!.cookie, "👍");
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.reactions[0].members).toEqual([
        { productMemberId: a.leader.memberId, userName: "leader", avatarUrl: null },
      ]);
      const stored = await rowsOf(messageId);
      expect(stored).toHaveLength(1);
      expect(stored[0]!.memberId).toBe(a.leader.memberId);
    });

    test("指定した絵文字だけ外す(同じ人の他の絵文字は残る)", async () => {
      const task = await insertTask(a.members[0]!.memberId);
      const messageId = await makeComment(a.productId, task.taskId, a.members[0]!.cookie);
      await press(a.productId, task.taskId, messageId, a.members[0]!.cookie, "👍");
      await press(a.productId, task.taskId, messageId, a.members[0]!.cookie, "🎉");

      const res = await unpress(a.productId, task.taskId, messageId, a.members[0]!.cookie, "👍");
      expect(res.status).toBe(200);
      expect((await res.json()).reactions.map((r: { emoji: string }) => r.emoji)).toEqual(["🎉"]);
      const stored = await rowsOf(messageId);
      expect(stored).toHaveLength(1);
      expect(stored[0]!.emoji).toBe("🎉");
    });

    test("DELETE で絵文字を指定しない・知らない絵文字は 422", async () => {
      const task = await insertTask(a.members[0]!.memberId);
      const messageId = await makeComment(a.productId, task.taskId, a.members[0]!.cookie);
      await press(a.productId, task.taskId, messageId, a.members[0]!.cookie, "👍");

      const missing = await request("DELETE", url(a.productId, task.taskId, messageId), {
        cookie: a.members[0]!.cookie,
      });
      expect(missing.status).toBe(422);
      const unknown = await unpress(a.productId, task.taskId, messageId, a.members[0]!.cookie, "🚀");
      expect(unknown.status).toBe(422);
      // 外れていない
      expect(await rowsOf(messageId)).toHaveLength(1);
    });

    test("何も押していないのに DELETE しても 200(残りは空)", async () => {
      const task = await insertTask(a.members[0]!.memberId);
      const messageId = await makeComment(a.productId, task.taskId, a.members[0]!.cookie);
      const res = await unpress(a.productId, task.taskId, messageId, a.leader.cookie, "👍");
      expect(res.status).toBe(200);
      expect(await res.json()).toEqual({ reactions: [] });
    });

    test("ログ(完了報告)にも押せる", async () => {
      const task = await insertTask(a.members[0]!.memberId);
      const report = await request(
        "POST",
        `/api/product/${a.productId}/task/${task.taskId}/complete-report`,
        { cookie: a.members[0]!.cookie, body: { body: "報告します" } },
      );
      expect(report.status).toBe(200);
      const [log] = await db
        .select()
        .from(taskMessages)
        .where(eq(taskMessages.taskId, task.taskId));
      const res = await press(a.productId, task.taskId, log!.messageId, a.leader.cookie, "🎉");
      expect(res.status).toBe(200);
      expect(await rowsOf(log!.messageId)).toHaveLength(1);
    });
  });

  describe("履歴に載る", () => {
    test("GET …/message の各行に、絵文字ごとのリアクションが付く", async () => {
      const task = await insertTask(a.members[0]!.memberId);
      const messageId = await makeComment(a.productId, task.taskId, a.members[0]!.cookie);
      await press(a.productId, task.taskId, messageId, a.members[0]!.cookie, "👍");
      await press(a.productId, task.taskId, messageId, a.leader.cookie, "✅");

      const res = await request("GET", reactionUrl(a.productId, task.taskId), {
        cookie: a.members[1]!.cookie,
      });
      expect(res.status).toBe(200);
      const { messages } = await res.json();
      const row = messages.find((m: { messageId: string }) => m.messageId === messageId);
      expect(row.reactions).toEqual([
        {
          emoji: "👍",
          members: [{ productMemberId: a.members[0]!.memberId, userName: "member1", avatarUrl: null }],
        },
        {
          emoji: "✅",
          members: [{ productMemberId: a.leader.memberId, userName: "leader", avatarUrl: null }],
        },
      ]);
    });

    test("リアクションのないメッセージは空配列", async () => {
      const task = await insertTask(a.members[0]!.memberId);
      await makeComment(a.productId, task.taskId, a.members[0]!.cookie);
      const res = await request("GET", reactionUrl(a.productId, task.taskId), {
        cookie: a.leader.cookie,
      });
      const { messages } = await res.json();
      expect(messages.every((m: { reactions: unknown[] }) => m.reactions.length === 0)).toBe(true);
    });
  });
});
