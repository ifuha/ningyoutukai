import { and, eq } from "drizzle-orm";
import { Elysia, t } from "elysia";
import { db } from "../../db";
import { productMembers, taskMessageReactions, taskMessages, tasks } from "../../db/schema";
import { authGuard } from "../../lib/auth-guard";
import { actorFor } from "../../lib/message-view";
import { getMembership } from "../../lib/product-access";
import { MessageSchema } from "../../lib/response-schema";
import { ReactionListSchema, loadReactions } from "../../lib/reaction-view";
import { reactionEmojis } from "../../lib/reaction";
import { canComment } from "../../lib/task-flow";
import { canSee, taskColumns } from "../../lib/task-view";

const params = t.Object({
  productId: t.String({ format: "uuid" }),
  taskId: t.String({ format: "uuid" }),
  messageId: t.String({ format: "uuid" }),
});

/**
 * タスクのメッセージへのリアクション(docs/v2.0/message-feature.md)。
 * - 押せるのは、コメントを書ける人(リーダーと担当者)。完了済みのタスクは不可
 * - **違う絵文字なら、1 人が複数押せる**(主キーは messageId + memberId + emoji)。
 *   同じ絵文字をもう一度押すと、その 1 件が押し直される。外すのは DELETE(絵文字を指定)
 * - 絵文字は reaction.ts の 5 個だけ(422)
 *
 * どちらも応答には、そのメッセージの最新のリアクション(絵文字ごとの一覧)を返す
 */
export const messageReactions = new Elysia({ name: "task-reaction" })
  .use(authGuard)
  .post(
    "/api/product/:productId/task/:taskId/message/:messageId/reaction",
    async ({ params: p, body, user, status }) => {
      const check = await loadTarget(p.productId, p.taskId, p.messageId, user.userId);
      if (check.ok === false) return status(check.status, check.error);
      const { viewer, task, message } = check;

      const actor = actorFor(viewer, task);
      if (!actor.isLeader && !actor.isAssignee) {
        return status(403, { message: "リーダーと担当者のみリアクションを付けられます" });
      }
      if (!canComment(actor, task.status)) {
        return status(409, { message: "完了済みのタスクにはリアクションを付けられません" });
      }
      if (message.deletedAt !== null) {
        return status(409, { message: "削除済みのメッセージにはリアクションを付けられません" });
      }

      // 同じ絵文字の二重登録は、主キー(messageId + memberId + emoji)で防ぐ(違う絵文字は別行になる)
      try {
        await db
          .insert(taskMessageReactions)
          .values({
            messageId: message.messageId,
            memberId: viewer.productMemberId,
            emoji: body.emoji,
          })
          .onConflictDoUpdate({
            target: [taskMessageReactions.messageId, taskMessageReactions.memberId, taskMessageReactions.emoji],
            set: { createdAt: new Date() },
          });
      } catch (e) {
        // 押すまでの間にメッセージが削除されて、連鎖で消えた場合
        const still = await db
          .select({ messageId: taskMessages.messageId })
          .from(taskMessages)
          .where(eq(taskMessages.messageId, message.messageId));
        if (still.length === 0) {
          return status(404, { message: "メッセージが見つかりません" });
        }
        throw e;
      }

      return { reactions: await reactionsOf(message.messageId) };
    },
    {
      requireUser: true,
      params,
      body: t.Object({ emoji: t.UnionEnum([...reactionEmojis]) }),
      response: { 200: t.Object({ reactions: ReactionListSchema }), 403: MessageSchema, 404: MessageSchema, 409: MessageSchema },
      detail: { summary: "メッセージにリアクションを付ける(違う絵文字は複数押せる)" },
    },
  )
  .delete(
    "/api/product/:productId/task/:taskId/message/:messageId/reaction",
    async ({ params: p, query, user, status }) => {
      const check = await loadTarget(p.productId, p.taskId, p.messageId, user.userId);
      if (check.ok === false) return status(check.status, check.error);
      const { viewer, task, message } = check;

      const actor = actorFor(viewer, task);
      if (!actor.isLeader && !actor.isAssignee) {
        return status(403, { message: "リーダーと担当者のみリアクションを外せます" });
      }
      if (!canComment(actor, task.status)) {
        return status(409, { message: "完了済みのタスクではリアクションを外せません" });
      }

      // 指定した絵文字だけを外す(他の絵文字は残る)
      await db
        .delete(taskMessageReactions)
        .where(
          and(
            eq(taskMessageReactions.messageId, message.messageId),
            eq(taskMessageReactions.memberId, viewer.productMemberId),
            eq(taskMessageReactions.emoji, query.emoji),
          ),
        );

      return { reactions: await reactionsOf(message.messageId) };
    },
    {
      requireUser: true,
      params,
      // UnionEnum は先頭を既定値にして欠けたキーを通してしまうので、外す先の絵文字が
      // 必須であることが分かる Union(Literal)にする(欠け・未知の絵文字は 422)
      query: t.Object({ emoji: t.Union(reactionEmojis.map((e) => t.Literal(e))) }),
      response: { 200: t.Object({ reactions: ReactionListSchema }), 403: MessageSchema, 404: MessageSchema, 409: MessageSchema },
      detail: { summary: "メッセージのリアクションを取り消す(指定した絵文字だけ)" },
    },
  );

/** メッセージ 1 件のリアクション(絵文字ごと) */
async function reactionsOf(messageId: string) {
  return (await loadReactions([messageId])).get(messageId) ?? [];
}

type Loaded =
  | {
      ok: true;
      viewer: NonNullable<Awaited<ReturnType<typeof getMembership>>>;
      task: NonNullable<Awaited<ReturnType<typeof findTaskRow>>>;
      message: typeof taskMessages.$inferSelect;
    }
  | { ok: false; status: 403 | 404; error: { message: string } };

/** ビューア・タスク・メッセージをまとめて確認する(見えないものは存在しない扱いで 404) */
async function loadTarget(
  productId: string,
  taskId: string,
  messageId: string,
  userId: string,
): Promise<Loaded> {
  const viewer = await getMembership(productId, userId);
  if (!viewer) return { ok: false as const, status: 404 as const, error: { message: "プロダクトが見つかりません" } };

  const task = await findTaskRow(taskId, productId);
  if (!task || !canSee(task, viewer)) {
    return { ok: false as const, status: 404 as const, error: { message: "タスクが見つかりません" } };
  }
  const [message] = await db
    .select()
    .from(taskMessages)
    .where(and(eq(taskMessages.messageId, messageId), eq(taskMessages.taskId, task.taskId)));
  if (!message) {
    return { ok: false as const, status: 404 as const, error: { message: "メッセージが見つかりません" } };
  }
  return { ok: true as const, viewer, task, message };
}

async function findTaskRow(taskId: string, productId: string) {
  const [row] = await db
    .select(taskColumns)
    .from(tasks)
    .innerJoin(productMembers, eq(tasks.productMemberId, productMembers.productMemberId))
    .where(and(eq(tasks.taskId, taskId), eq(productMembers.productId, productId)));
  return row;
}
