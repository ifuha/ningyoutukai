import { and, eq } from "drizzle-orm";
import { Elysia, t } from "elysia";
import { db } from "../../db";
import { productMembers, tasks } from "../../db/schema";
import { authGuard } from "../../lib/auth-guard";
import { getMembership } from "../../lib/product-access";
import { taskColumns } from "../../lib/task-view";

// タスク情報変更 PATCH /api/product/:productId/task/:taskId(リーダーのみ)
export const updateTask = new Elysia({ name: "task-update-task" })
  .use(authGuard)
  .patch(
    "/api/product/:productId/task/:taskId",
    async ({ params, body, user, status }) => {
      const membership = await getMembership(params.productId, user.userId);
      if (!membership) return status(404, { message: "プロダクトが見つかりません" });
      if (membership.role !== "leader") {
        return status(403, { message: "プロダクトリーダーのみ実行できます" });
      }

      // タスクが URL のプロダクトに属しているか
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
      if (!task) return status(404, { message: "タスクが見つかりません" });

      // 変更する項目だけを集める(body に含まれない項目は変更しない)
      const changes: Partial<typeof tasks.$inferInsert> = {};
      if (body.taskName !== undefined) {
        const taskName = body.taskName.trim();
        if (!taskName) return status(400, { message: "タスク名を入力してください" });
        changes.taskName = taskName;
      }
      if (body.description !== undefined) changes.description = body.description;
      if (body.timeLimit !== undefined) {
        changes.timeLimit = body.timeLimit === null ? null : new Date(body.timeLimit);
      }
      if (body.isVisible !== undefined) changes.isVisible = body.isVisible;

      const [updated] = await db
        .update(tasks)
        .set(changes)
        .where(eq(tasks.taskId, params.taskId))
        .returning(taskColumns);
      return updated;
    },
    {
      requireUser: true,
      params: t.Object({
        productId: t.String({ format: "uuid" }),
        taskId: t.String({ format: "uuid" }),
      }),
      body: t.Object({
        taskName: t.Optional(t.String({ maxLength: 200 })),
        description: t.Optional(t.Union([t.String(), t.Null()])),
        timeLimit: t.Optional(t.Union([t.String({ format: "date-time" }), t.Null()])),
        isVisible: t.Optional(t.Boolean()),
      }),
      detail: { summary: "タスク情報変更" },
    }
  );
