import { and, eq, isNull } from "drizzle-orm";
import { Elysia, t } from "elysia";
import { db } from "../../db";
import { productMembers, taskMessages, tasks } from "../../db/schema";
import { authGuard } from "../../lib/auth-guard";
import { TaskMessageSchema } from "../../lib/message-view";
import { getMembership } from "../../lib/product-access";
import { MessageSchema } from "../../lib/response-schema";
import { canEditMessage } from "../../lib/task-flow";
import { canSee, taskColumns } from "../../lib/task-view";

// 本文の上限(UTF-16 の長さ。trim 前で判定する。docs/v2.0/message-feature.md の Q10 の案)
// TODO: コメント追加(create-message.ts)と同じ値。両方がマージされたら、1 か所にまとめる
const MAX_BODY_LENGTH = 2000;

// 本文を空にできない種類。報告・再提出・承認は、本文が任意なので、空に戻してよい
const BODY_REQUIRED_KINDS: readonly string[] = ["comment", "reject"];

// メッセージ編集 PATCH /api/product/:productId/task/:taskId/message/:messageId
// - 編集できるのは、書いた本人だけ(リーダーでも、他人のメッセージは編集できない)
// - 全種類(comment / report / resubmit / reject / approve)の本文を編集できる。種類・書いた人・日時は変えない
// - 削除済みのメッセージと、完了済みのタスクのメッセージは編集できない(409)
// - 本文を変えたときだけ editedAt を入れる。編集の履歴は持たない
export const updateMessage = new Elysia({ name: "task-update-message" })
  .use(authGuard)
  .patch(
    "/api/product/:productId/task/:taskId/message/:messageId",
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

      // URL のタスクに属するメッセージだけを対象にする(別のタスクのメッセージは存在しない扱い)
      const [message] = await db
        .select()
        .from(taskMessages)
        .where(
          and(
            eq(taskMessages.messageId, params.messageId),
            eq(taskMessages.taskId, task.taskId)
          )
        );
      if (!message) return status(404, { message: "メッセージが見つかりません" });

      // 見えるが、自分のメッセージではない
      if (message.authorMemberId !== viewer.productMemberId) {
        return status(403, { message: "自分のメッセージだけ編集できます" });
      }

      const text = body.body.trim();
      if (!text && BODY_REQUIRED_KINDS.includes(message.kind)) {
        return status(400, { message: "本文を入力してください" });
      }

      // 本人なのに編集できない理由は、削除済みか、完了済みのタスクのどちらか
      const actor = {
        productMemberId: viewer.productMemberId,
        isLeader: viewer.role === "leader",
        isAssignee: task.productMemberId === viewer.productMemberId,
      };
      if (!canEditMessage(actor, message, task.status)) {
        return status(409, {
          message: message.deletedAt
            ? "削除済みのメッセージは編集できません"
            : "完了済みのタスクのメッセージは編集できません",
        });
      }

      // 書いた人は、呼び出した本人(上で確認済み)
      const toItem = (m: typeof taskMessages.$inferSelect) => ({
        messageId: m.messageId,
        kind: m.kind,
        body: m.body,
        author: {
          productMemberId: viewer.productMemberId,
          userName: user.userName,
          avatarUrl: user.avatarUrl,
        },
        createdAt: m.createdAt,
        editedAt: m.editedAt,
        deleted: false,
      });

      // 本文が変わらなければ、何も書き換えない(「編集済み」にならない)
      if (text === message.body) return toItem(message);

      // 削除されていないときだけ更新する(確認から更新までの間に削除されても、書き戻さない)
      const [updated] = await db
        .update(taskMessages)
        .set({ body: text, editedAt: new Date() })
        .where(
          and(
            eq(taskMessages.messageId, message.messageId),
            isNull(taskMessages.deletedAt)
          )
        )
        .returning();
      if (!updated) {
        const [still] = await db
          .select({ messageId: taskMessages.messageId })
          .from(taskMessages)
          .where(eq(taskMessages.messageId, message.messageId));
        if (!still) return status(404, { message: "メッセージが見つかりません" });
        return status(409, { message: "削除済みのメッセージは編集できません" });
      }

      return toItem(updated);
    },
    {
      requireUser: true,
      params: t.Object({
        productId: t.String({ format: "uuid" }),
        taskId: t.String({ format: "uuid" }),
        messageId: t.String({ format: "uuid" }),
      }),
      body: t.Object({
        // NUL 文字(\u0000)は、PostgreSQL の text に入らず 500 になるので、422 で弾く
        body: t.String({ maxLength: MAX_BODY_LENGTH, pattern: "^[^\\u0000]*$" }),
      }),
      response: {
        200: TaskMessageSchema,
        400: MessageSchema,
        403: MessageSchema,
        404: MessageSchema,
        409: MessageSchema,
      },
      detail: { summary: "メッセージを編集" },
    }
  );