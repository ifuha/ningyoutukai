import { and, eq } from "drizzle-orm";
import { Elysia, t } from "elysia";
import { db } from "../../db";
import { productMembers, tasks } from "../../db/schema";
import { authGuard } from "../../lib/auth-guard";
import { getMembership } from "../../lib/product-access";
import { taskColumns } from "../../lib/task-view";

// タスク完了確定 PATCH /api/product/:productId/task/:taskId/complete
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

      return task;
    },
    {
      requireUser: true,
      params: t.Object({
        productId: t.String({ format: "uuid" }),
        taskId: t.String({ format: "uuid" }),
      }),
      detail: { summary: "タスク完了確定(リーダー)" },
    }
  );
