import { and, eq } from "drizzle-orm";
import { Elysia, t } from "elysia";
import { webOrigin } from "../../auth";
import { db } from "../../db";
import { productMembers, tasks } from "../../db/schema";
import { authGuard } from "../../lib/auth-guard";
import { mailer, mailPreview } from "../../lib/mailer";
import { MAX_BODY_LENGTH } from "../../lib/message-body";
import { getMemberContact, getMembership } from "../../lib/product-access";
import { moveTaskWithMessage } from "../../lib/task-message-log";
import { nextStep } from "../../lib/task-flow";
import { Conflict, taskStillExists } from "../../lib/task-race";
import { MessageSchema } from "../../lib/response-schema";
import { TaskSchema, canSee, taskColumns } from "../../lib/task-view";
import { NO_NUL } from "../../lib/validation";

// タスクの差し戻し(再提出の要求) POST /api/product/:productId/task/:taskId/reject
// 状態: 確認待ち(reported) → 差し戻し中(rejected)。やり取りに「差し戻し」のログを 1 件残す
// 本文は必須(何を直すべきかを書かないと差し戻せない。docs/v2.0/message-feature.md)
export const rejectTask = new Elysia({ name: "task-reject" })
  .use(authGuard)
  .post(
    "/api/product/:productId/task/:taskId/reject",
    async ({ params, body, user, status }) => {
      const viewer = await getMembership(params.productId, user.userId);
      if (!viewer) return status(404, { message: "プロダクトが見つかりません" });
      if (viewer.role !== "leader") {
        return status(403, { message: "プロダクトリーダーのみ差し戻せます" });
      }

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

      const text = body.body.trim();
      if (!text) return status(400, { message: "差し戻しの理由を入力してください" });

      // 差し戻せるのは確認待ちだけ(報告されていない・すでに完了済みのタスクは差し戻せない)
      const step = nextStep(task.status, "reject");
      if (!step.ok) return status(409, { message: "確認待ちのタスクだけ差し戻せます" });

      // 状態の更新と、やり取りへのログの insert を 1 トランザクションで行う
      let updated: typeof task;
      try {
        const moved = await moveTaskWithMessage({
          taskId: task.taskId,
          from: task.status,
          to: step.next,
          kind: step.kind,
          authorMemberId: viewer.productMemberId,
          body: text,
        });
        if (!moved.ok) throw new Conflict();
        updated = moved.task;
      } catch (e) {
        if (!(e instanceof Conflict)) throw e;
        // 確認から更新までの間に削除された場合
        if (!(await taskStillExists(task.taskId))) {
          return status(404, { message: "タスクが見つかりません" });
        }
        return status(409, { message: "すでに差し戻しているか、確認済みです" });
      }

      // 担当者へメールで知らせる(mailer.send は失敗しても例外を投げない)
      const assignee = await getMemberContact(updated.productMemberId);
      if (assignee) {
        await mailer.send({
          to: assignee.email,
          subject: `タスクが差し戻されました: ${updated.taskName}`,
          text: [
            `${assignee.userName} さん\n\nタスク「${updated.taskName}」がプロダクトリーダーによって差し戻されました。修正して、再提出してください。`,
            "",
            mailPreview(text),
            "",
            "プロダクトを開く:",
            `${webOrigin}/products/${params.productId}`,
          ].join("\n"),
        });
      }

      return updated;
    },
    {
      requireUser: true,
      params: t.Object({
        productId: t.String({ format: "uuid" }),
        taskId: t.String({ format: "uuid" }),
      }),
      body: t.Object({
        body: t.String({ maxLength: MAX_BODY_LENGTH, pattern: NO_NUL }),
      }),
      response: {
        200: TaskSchema,
        400: MessageSchema,
        403: MessageSchema,
        404: MessageSchema,
        409: MessageSchema,
      },
      detail: { summary: "タスクの差し戻し(リーダー・本文必須)" },
    }
  );
