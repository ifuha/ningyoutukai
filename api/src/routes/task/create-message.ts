import { and, eq } from "drizzle-orm";
import { Elysia, t } from "elysia";
import { db } from "../../db";
import { productMembers, taskMessages, tasks } from "../../db/schema";
import { authGuard } from "../../lib/auth-guard";
import { TaskMessageSchema } from "../../lib/message-view";
import { getMembership } from "../../lib/product-access";
import { MessageSchema } from "../../lib/response-schema";
import { canComment } from "../../lib/task-flow";
import { taskStillExists } from "../../lib/task-race";
import { canSee, taskColumns } from "../../lib/task-view";

// コメントの本文の上限(UTF-16 の長さ。trim 前で判定する。docs/v2.0/message-feature.md の Q10 の案)
const MAX_BODY_LENGTH = 2000;

// コメント追加 POST /api/product/:productId/task/:taskId/message
// - 書けるのは、リーダーと担当者だけ(公開タスクのほかのメンバーは、読むだけ)
// - 完了済みのタスクには書けない
// - 種類(kind)は常に comment。報告・差し戻し・承認は、それぞれの API が作る
// - 通知メールは送らない(無料枠のため。報告・再提出・差し戻し・承認だけ通知する)
export const createMessage = new Elysia({ name: "task-create-message" })
  .use(authGuard)
  .post(
    "/api/product/:productId/task/:taskId/message",
    async ({ params, body, user, status }) => {
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

      const actor = {
        productMemberId: viewer.productMemberId,
        isLeader: viewer.role === "leader",
        isAssignee: task.productMemberId === viewer.productMemberId,
      };
      // 見えるが、書く権限がない(公開タスクのほかのメンバー)
      if (!actor.isLeader && !actor.isAssignee) {
        return status(403, { message: "リーダーと担当者のみコメントを書けます" });
      }

      const text = body.body.trim();
      if (!text) return status(400, { message: "コメントを入力してください" });

      // 権限があるのに書けない理由は、完了済みだけ
      if (!canComment(actor, task.status)) {
        return status(409, { message: "完了済みのタスクにはコメントを書けません" });
      }

      // 確認から挿入までの間に完了になっても、コメントが 1 件入るだけで害はないので、状態の再確認はしない。
      // 削除された場合だけ、外部キーの違反になるので 404 にする
      let created: typeof taskMessages.$inferSelect | undefined;
      try {
        [created] = await db
          .insert(taskMessages)
          .values({
            taskId: task.taskId,
            authorMemberId: viewer.productMemberId,
            kind: "comment",
            body: text,
          })
          .returning();
      } catch (e) {
        if (!(await taskStillExists(task.taskId))) {
          return status(404, { message: "タスクが見つかりません" });
        }
        throw e;
      }
      if (!created) throw new Error("コメントを保存できませんでした");

      return status(201, {
        messageId: created.messageId,
        kind: created.kind,
        body: created.body,
        author: {
          productMemberId: viewer.productMemberId,
          userName: user.userName,
          avatarUrl: user.avatarUrl,
        },
        createdAt: created.createdAt,
        editedAt: created.editedAt,
        deleted: false,
      });
    },
    {
      requireUser: true,
      params: t.Object({
        productId: t.String({ format: "uuid" }),
        taskId: t.String({ format: "uuid" }),
      }),
      body: t.Object({
        // NUL 文字(\u0000)は、PostgreSQL の text に入らず 500 になるので、422 で弾く
        body: t.String({ maxLength: MAX_BODY_LENGTH, pattern: "^[^\\u0000]*$" }),
      }),
      response: {
        201: TaskMessageSchema,
        400: MessageSchema,
        403: MessageSchema,
        404: MessageSchema,
        409: MessageSchema,
      },
      detail: { summary: "タスクにコメントを追加" },
    }
  );