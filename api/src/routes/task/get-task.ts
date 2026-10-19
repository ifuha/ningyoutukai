import { Elysia, t } from "elysia";
import { authGuard } from "../../lib/auth-guard";

// 指定したタスクを取得 GET /api/product/:productId/task/:taskId
export const getTask = new Elysia({ name: "task-get-task" })
  .use(authGuard)
  .get(
    "/api/product/:productId/task/:taskId",
    async ({ params }) => {
      return { taskId: params.taskId };
    },
    {
      requireUser: true,
      params: t.Object({
        productId: t.String({ format: "uuid" }),
        taskId: t.String({ format: "uuid" }),
      }),
      detail: { summary: "指定したタスクを取得" },
    }
  );
