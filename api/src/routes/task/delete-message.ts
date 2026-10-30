import { and, eq, isNull } from "drizzle-orm";
import { Elysia, t } from "elysia";
import { db } from "../../db";
import { productMembers, taskMessages, tasks } from "../../db/schema";
import { authGuard } from "../../lib/auth-guard";
import { getMembership } from "../../lib/product-access";
import { MessageSchema } from "../../lib/response-schema";
import { canDeleteMessage } from "../../lib/task-flow";
import { canSee, taskColumns } from "../../lib/task-view";

// メッセージ削除 DELETE /api/product/:productId/task/:taskId/message/:messageId
// - 論理削除: 本文を空にして deletedAt を入れる。行は残り、履歴には「削除済み」として出る
// - 消せるのは、種類が comment のものだけ。報告・再提出・差し戻し・承認は、状態の履歴なので消せない
// - 消せる人は、書いた本人と、リーダー
// - 削除済みのメッセージ、完了済みのタスクのメッセージは消せない(409)
// - 成功は 204(本文なし。プロダクト・タスクの DELETE と同じ)
export const deleteMessage = new Elysia({ name: "task-delete-message" })
  .use(authGuard)
  .delete(
    "/api/product/:productId/task/:taskId/message/:messageId",
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

      // URL のタスクに属するメッセージだけを対象にする(別のタスクのメッセージは存在しない扱い)
      const [message] = await db
        .select()
        .from(taskMessages)
        .where(
          and(
            eq(taskMessages.messageId, params.messageId),
            eq(taskMessages.taskId, task.taskId)
          )
        );
      if (!message) return status(404, { message: "メッセージが見つかりません" });

      const actor = {
        productMemberId: viewer.productMemberId,
        isLeader: viewer.role === "leader",
        isAssignee: task.productMemberId === viewer.productMemberId,
      };
      // 見えるが、書いた本人でも、リーダーでもない
      if (message.authorMemberId !== viewer.productMemberId && !actor.isLeader) {
        return status(403, { message: "自分のメッセージか、リーダーのみ削除できます" });
      }

      // 権限があるのに消せない理由は、コメント以外・削除済み・完了済みのタスクのどれか
      if (!canDeleteMessage(actor, message, task.status)) {
        return status(409, {
          message:
            message.kind !== "comment"
              ? "コメント以外のメッセージは削除できません"
              : message.deletedAt
                ? "すでに削除されています"
                : "完了済みのタスクのメッセージは削除できません",
        });
      }

      // 削除されていないときだけ更新する(同時に 2 回呼ばれても、1 回しか削除しない)。
      // 本文は空にする(内容を、DB にも残さない)
      const deleted = await db
        .update(taskMessages)
        .set({ body: "", deletedAt: new Date() })
        .where(
          and(
            eq(taskMessages.messageId, message.messageId),
            eq(taskMessages.kind, "comment"),
            isNull(taskMessages.deletedAt)
          )
        )
        .returning({ messageId: taskMessages.messageId });
      if (deleted.length === 0) {
        // 確認から更新までの間に、削除された場合
        const [still] = await db
          .select({ messageId: taskMessages.messageId })
          .from(taskMessages)
          .where(eq(taskMessages.messageId, message.messageId));
        if (!still) return status(404, { message: "メッセージが見つかりません" });
        return status(409, { message: "すでに削除されています" });
      }

      return status(204, undefined);
    },
    {
      requireUser: true,
      params: t.Object({
        productId: t.String({ format: "uuid" }),
        taskId: t.String({ format: "uuid" }),
        messageId: t.String({ format: "uuid" }),
      }),
      response: {
        204: t.Undefined(),
        403: MessageSchema,
        404: MessageSchema,
        409: MessageSchema,
      },
      detail: { summary: "メッセージを削除(コメントのみ)" },
    }
  );