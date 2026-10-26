import { and, asc, eq } from "drizzle-orm";
import { Elysia, t } from "elysia";
import { db } from "../../db";
import { productMembers, taskMessages, tasks, users } from "../../db/schema";
import { authGuard } from "../../lib/auth-guard";
import { TaskMessageListSchema } from "../../lib/message-view";
import { getMembership } from "../../lib/product-access";
import { MessageSchema } from "../../lib/response-schema";
import { canSee, taskColumns } from "../../lib/task-view";

// メッセージ履歴の取得 GET /api/product/:productId/task/:taskId/message
// - タスクを見られる人なら、誰でも読める(公開タスクはメンバー全員、非公開はリーダーと担当者だけ)
// - 古い順(同じ日時は messageId 順)
// - 削除済みのメッセージは、本文を空にして deleted: true で返す
export const listMessages = new Elysia({ name: "task-list-messages" })
  .use(authGuard)
  .get(
    "/api/product/:productId/task/:taskId/message",
    async ({ params, user, status }) => {
      const viewer = await getMembership(params.productId, user.userId);
      if (!viewer) return status(404, { message: "プロダクトが見つかりません" });

      // タスクは product_members 経由でプロダクトに属する。URL の productId と違えば存在しない扱い
      const [task] = await db
        .select(taskColumns)
        .from(tasks)
        .innerJoin(
          productMembers,
          eq(tasks.productMemberId, productMembers.productMemberId)
        )
        .where(
          and(
            eq(tasks.taskId, params.taskId),
            eq(productMembers.productId, params.productId)
          )
        );
      // 見えないタスクは、存在しないタスクと同じ 404(存在を漏らさない)
      if (!task || !canSee(task, viewer)) {
        return status(404, { message: "タスクが見つかりません" });
      }

      const rows = await db
        .select({
          messageId: taskMessages.messageId,
          kind: taskMessages.kind,
          body: taskMessages.body,
          createdAt: taskMessages.createdAt,
          editedAt: taskMessages.editedAt,
          deletedAt: taskMessages.deletedAt,
          authorMemberId: taskMessages.authorMemberId,
          userName: users.userName,
          avatarUrl: users.avatarUrl,
        })
        .from(taskMessages)
        .innerJoin(
          productMembers,
          eq(taskMessages.authorMemberId, productMembers.productMemberId)
        )
        .innerJoin(users, eq(productMembers.userId, users.userId))
        .where(eq(taskMessages.taskId, task.taskId))
        .orderBy(asc(taskMessages.createdAt), asc(taskMessages.messageId));

      return {
        messages: rows.map((r) => {
          const deleted = r.deletedAt !== null;
          return {
            messageId: r.messageId,
            kind: r.kind,
            // 削除済みは、DB に本文が残っていても返さない
            body: deleted ? "" : r.body,
            author: {
              productMemberId: r.authorMemberId,
              userName: r.userName,
              avatarUrl: r.avatarUrl,
            },
            createdAt: r.createdAt,
            editedAt: r.editedAt,
            deleted,
          };
        }),
      };
    },
    {
      requireUser: true,
      params: t.Object({
        productId: t.String({ format: "uuid" }),
        taskId: t.String({ format: "uuid" }),
      }),
      response: { 200: TaskMessageListSchema, 404: MessageSchema },
      detail: { summary: "タスクのメッセージ履歴取得" },
    }
  );