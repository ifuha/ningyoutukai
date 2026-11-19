import { and, eq } from "drizzle-orm";
import { Elysia, t } from "elysia";
import { db } from "../../db";
import { productMembers, tasks } from "../../db/schema";
import { authGuard } from "../../lib/auth-guard";
import { getMembership } from "../../lib/product-access";
import { MessageSchema } from "../../lib/response-schema";
import { markTaskRead } from "../../lib/task-unread";
import { canSee, taskColumns } from "../../lib/task-view";

// タスクを開いたことを見える POST /api/product/:productId/task/:taskId/read
// - タスクの詳細を開いたときに呼び、最後に開いた日時を更新する(次のツリー取得で unreadCount が 0 になる)
// - 見えないタスクは 404(他のタスク API と同じ。存在を漏らさない)
// - 成功は 204(体は無い。画面は、ツリーを取得し直して未読の印を消す)
export const markRead = new Elysia({ name: "task-mark-read" })
  .use(authGuard)
  .post(
    "/api/product/:productId/task/:taskId/read",
    async ({ params, user, status }) => {
      const viewer = await getMembership(params.productId, user.userId);
      if (!viewer) return status(404, { message: "プロダクトが見つかりません" });

      // タスクは product_members 経由でプロダクトに属する。URL の productId と違えば存在しない扱い
      const [task] = await db
        .select(taskColumns)
        .from(tasks)
        .innerJoin(
          productMembers,
          eq(tasks.productMemberId, productMembers.productMemberId),
        )
        .where(
          and(
            eq(tasks.taskId, params.taskId),
            eq(productMembers.productId, params.productId),
          ),
        );
      if (!task || !canSee(task, viewer)) {
        return status(404, { message: "タスクが見つかりません" });
      }

      await markTaskRead(task.taskId, viewer.productMemberId);
      return status(204, undefined);
    },
    {
      requireUser: true,
      params: t.Object({
        productId: t.String({ format: "uuid" }),
        taskId: t.String({ format: "uuid" }),
      }),
      response: {
        204: t.Undefined(),
        404: MessageSchema,
      },
      detail: { summary: "タスクを既読にする(最後に開いた日時を更新)" },
    },
  );
