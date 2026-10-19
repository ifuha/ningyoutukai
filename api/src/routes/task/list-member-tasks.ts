import { and, eq } from "drizzle-orm";
import { Elysia, t } from "elysia";
import { db } from "../../db";
import { tasks } from "../../db/schema";
import { authGuard } from "../../lib/auth-guard";
import { getMembership, isMemberOfProduct } from "../../lib/product-access";
import { taskColumns, visibleTo } from "../../lib/task-view";

// 指定したメンバーのタスクを取得 GET /api/product/:productId/member/:memberId/task
export const listMemberTasks = new Elysia({ name: "task-list-member-tasks" })
  .use(authGuard)
  .get(
    "/api/product/:productId/member/:memberId/task",
    async ({ params, user, status }) => {
      const viewer = await getMembership(params.productId, user.userId);
      if (!viewer) return status(404, { message: "プロダクトが見つかりません" });

      if (!(await isMemberOfProduct(params.productId, params.memberId)))
        return status(404, { message: "メンバーが見つかりません" });

      return await db
        .select(taskColumns)
        .from(tasks)
        .where(and(eq(tasks.productMemberId, params.memberId), visibleTo(viewer)));
    },
    {
      requireUser: true,
      params: t.Object({
        productId: t.String({ format: "uuid" }),
        memberId: t.String({ format: "uuid" }),
      }),
      detail: { summary: "指定したメンバーのタスクを取得" },
    }
  );
