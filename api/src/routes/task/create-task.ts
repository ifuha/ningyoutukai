import { Elysia, t } from "elysia";
import { db } from "../../db";
import { tasks } from "../../db/schema";
import { authGuard } from "../../lib/auth-guard";
import { getMembership } from "../../lib/product-access";
import { taskColumns } from "../../lib/task-view";

// タスクを追加 POST /api/product/:productId/task
export const createTask = new Elysia({ name: "task-create-task" })
  .use(authGuard)
  .post(
    "/api/product/:productId/task",
    async ({ params, body, user, status }) => {
      const membership = await getMembership(params.productId, user.userId);
      if (!membership) return status(404, { message: "プロダクトが見つかりません" });
      if (membership.role !== "leader") {
        return status(403, { message: "プロダクトリーダーのみ実行できます" });
      }

      const [created] = await db
        .insert(tasks)
        .values({
          taskName: body.taskName.trim(),
          productMemberId: body.productMemberId,
          description: body.description,
          timeLimit: body.timeLimit ? new Date(body.timeLimit) : undefined,
          taskTypeId: body.taskTypeId,
          isVisible: body.isVisible,
        })
        .returning(taskColumns);

      return status(201, created);
    },
    {
      requireUser: true,
      params: t.Object({ productId: t.String({ format: "uuid" }) }),
      body: t.Object({
        taskName: t.String({ maxLength: 200 }),
        productMemberId: t.String({ format: "uuid" }),
        description: t.Optional(t.String()),
        timeLimit: t.Optional(t.String({ format: "date-time" })),
        taskTypeId: t.Optional(t.String({ format: "uuid" })),
        isVisible: t.Optional(t.Boolean()),
      }),
      detail: { summary: "タスクを追加" },
    }
  );
