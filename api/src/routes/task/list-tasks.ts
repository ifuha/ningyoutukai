import { and, eq } from "drizzle-orm";
import { Elysia, t } from "elysia";
import { db } from "../../db";
import { productMembers, tasks } from "../../db/schema";
import { authGuard } from "../../lib/auth-guard";
import { getMembership } from "../../lib/product-access";
import { taskColumns, visibleTo } from "../../lib/task-view";

// タスク一覧取得 GET /api/product/:productId/task
export const listTasks = new Elysia({ name: "task-list-tasks" })
  .use(authGuard)
  .get(
    "/api/product/:productId/task",
    async ({ params, user, status }) => {
      const viewer = await getMembership(params.productId, user.userId);
      if (!viewer) return status(404, { message: "プロダクトが見つかりません" });

      return await db
        .select(taskColumns)
        .from(tasks)
        .innerJoin(
          productMembers,
          eq(tasks.productMemberId, productMembers.productMemberId)
        )
        .where(
          and(
            eq(productMembers.productId, params.productId),
            visibleTo(viewer)
          )
        );
    },
    {
      requireUser: true,
      params: t.Object({ productId: t.String({ format: "uuid" }) }),
      detail: { summary: "タスク一覧取得" },
    }
  );
