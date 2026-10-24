import { and, eq } from "drizzle-orm";
import { Elysia, t } from "elysia";
import { db } from "../../db";
import { productMembers, tasks } from "../../db/schema";
import { authGuard } from "../../lib/auth-guard";
import { mailer } from "../../lib/mailer";
import { getMemberContact, getMembership } from "../../lib/product-access";
import { taskStillExists } from "../../lib/task-race";
import { MessageSchema } from "../../lib/response-schema";
import { TaskSchema, taskColumns } from "../../lib/task-view";

// タスク完了確定 PATCH /api/product/:productId/task/:taskId/complete
// 状態: 完了(completed)にする。
// v1 の挙動を維持している: 未報告(in_progress)のタスクも、リーダーは直接完了にできる。
// 「報告済み(reported)のときだけ承認できる」にするかは未決定(docs/v2.0/message-feature.md の Q17)
export const confirmComplete = new Elysia({ name: "task-confirm-complete" })
  .use(authGuard)
  .patch(
    "/api/product/:productId/task/:taskId/complete",
    async ({ params, user, status }) => {
      const membership = await getMembership(params.productId, user.userId);
      if (!membership) return status(404, { message: "プロダクトが見つかりません" });
      if (membership.role !== "leader") {
        return status(403, { message: "プロダクトリーダーのみ実行できます" });
      }

      // URL のプロダクトに属するタスクだけを対象にする(別プロダクトのタスクは存在しない扱い)
      const [task] = await db
        .select(taskColumns)
        .from(tasks)
        .innerJoin(productMembers, eq(tasks.productMemberId, productMembers.productMemberId))
        .where(and(eq(tasks.taskId, params.taskId), eq(productMembers.productId, params.productId)));
      if (!task) return status(404, { message: "タスクが見つかりません" });

      if (task.status === "completed") {
        return status(409, { message: "すでに完了しています" });
      }

      // 「読んだときの状態のまま」のときだけ更新する(同時に呼ばれても二重に完了にしない)
      const [updated] = await db
        .update(tasks)
        .set({ status: "completed", completedAt: new Date() })
        .where(and(eq(tasks.taskId, task.taskId), eq(tasks.status, task.status)))
        .returning(taskColumns);
      if (!updated) {
        // 確認から更新までの間に削除された場合
        if (!(await taskStillExists(task.taskId))) {
          return status(404, { message: "タスクが見つかりません" });
        }
        return status(409, { message: "すでに完了しています" });
      }

      // 担当メンバーへ完了を通知する(送信に失敗しても API は成功のまま)
      const assignee = await getMemberContact(updated.productMemberId);
      if (assignee) {
        await mailer.send({
          to: assignee.email,
          subject: `タスクが完了になりました: ${updated.taskName}`,
          text: `${assignee.userName} さん\n\nタスク「${updated.taskName}」がプロダクトリーダーによって完了になりました。`,
        });
      }

      return updated;
    },
    {
      requireUser: true,
      params: t.Object({
        productId: t.String({ format: "uuid" }),
        taskId: t.String({ format: "uuid" }),
      }),
      response: { 200: TaskSchema, 403: MessageSchema, 404: MessageSchema, 409: MessageSchema },
      detail: { summary: "タスク完了確定(リーダー)" },
    }
  );