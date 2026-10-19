import { and, eq, isNull } from "drizzle-orm";
import { Elysia, t } from "elysia";
import { db } from "../../db";
import { productMembers, tasks } from "../../db/schema";
import { authGuard } from "../../lib/auth-guard";
import { getMembership } from "../../lib/product-access";
import { canSee, taskColumns } from "../../lib/task-view";

// タスク完了報告 POST /api/product/:productId/task/:taskId/complete-report
export const reportComplete = new Elysia({ name: "task-report-complete" })
  .use(authGuard)
  .post(
    "/api/product/:productId/task/:taskId/complete-report",
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
      if (!task || !canSee(task, viewer)) {
        return status(404, { message: "タスクが見つかりません" });
      }

      // 報告できるのは担当者本人だけ(リーダーでも担当者でなければ不可)
      if (task.productMemberId !== viewer.productMemberId) {
        return status(403, { message: "担当者のみ完了を報告できます" });
      }

      if (task.completedAt) return status(409, { message: "すでに完了しています" });
      if (task.reportedAt) return status(409, { message: "すでに報告済みです" });

      // 同時リクエストで二重に報告されないよう、未報告・未完了の条件を付けて更新する
      const [updated] = await db
        .update(tasks)
        .set({ reportedAt: new Date() })
        .where(
          and(
            eq(tasks.taskId, task.taskId),
            isNull(tasks.reportedAt),
            isNull(tasks.completedAt)
          )
        )
        .returning(taskColumns);
      if (!updated) return status(409, { message: "すでに報告済みです" });

      return updated;
    },
    {
      requireUser: true,
      params: t.Object({
        productId: t.String({ format: "uuid" }),
        taskId: t.String({ format: "uuid" }),
      }),
      detail: { summary: "タスク完了報告" },
    }
  );
