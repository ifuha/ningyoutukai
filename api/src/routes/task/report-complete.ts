import { and, eq } from "drizzle-orm";
import { Elysia, t } from "elysia";
import { webOrigin } from "../../auth";
import { db } from "../../db";
import { productMembers, tasks } from "../../db/schema";
import { authGuard } from "../../lib/auth-guard";
import { mailer, mailPreview } from "../../lib/mailer";
import { MAX_BODY_LENGTH } from "../../lib/message-body";
import {
  getLeaderContacts,
  getMemberContact,
  getMembership,
} from "../../lib/product-access";
import { moveTaskWithMessage } from "../../lib/task-message-log";
import { nextStep } from "../../lib/task-flow";
import { Conflict, taskStillExists } from "../../lib/task-race";
import { MessageSchema } from "../../lib/response-schema";
import { TaskSchema, canSee, taskColumns } from "../../lib/task-view";
import { NO_NUL } from "../../lib/validation";

// タスク完了報告 POST /api/product/:productId/task/:taskId/complete-report
// 状態: 作業中(in_progress) → 確認待ち(reported)。差し戻し中(rejected)からの再提出も同じ API で受ける
// 本文は任意。報告と同時に、やりとりに「完了報告」(または「再提出」)のログを 1 件残す
export const reportComplete = new Elysia({ name: "task-report-complete" })
  .use(authGuard)
  .post(
    "/api/product/:productId/task/:taskId/complete-report",
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
      if (!task || !canSee(task, viewer)) {
        return status(404, { message: "タスクが見つかりません" });
      }

      // 報告できるのは担当者本人だけ(リーダーでも担当者でなければ不可)
      if (task.productMemberId !== viewer.productMemberId) {
        return status(403, { message: "担当者のみ完了を報告できます" });
      }

      if (task.status === "completed") {
        return status(409, { message: "すでに完了しています" });
      }
      // 報告できる状態は、作業中と差し戻し中だけ。残るのは確認待ち(報告済み)
      const step = nextStep(task.status, "report");
      if (!step.ok) return status(409, { message: "すでに報告済みです" });

      // 状態の更新と、やり取りへのログの insert を 1 トランザクションで行う。
      // reportedAt は「最後に報告した日時」(再提出でも更新する)
      let updated: typeof task;
      try {
        const moved = await moveTaskWithMessage({
          taskId: task.taskId,
          from: task.status,
          to: step.next,
          kind: step.kind,
          authorMemberId: viewer.productMemberId,
          body: (body?.body ?? "").trim(),
        });
        if (!moved.ok) throw new Conflict();
        updated = moved.task;
      } catch (e) {
        if (!(e instanceof Conflict)) throw e;
        // 確認から更新までの間に削除された場合
        if (!(await taskStillExists(task.taskId))) {
          return status(404, { message: "タスクが見つかりません" });
        }
        return status(409, { message: "すでに報告済みです" });
      }

      // 全リーダーへメール通知(mailer.send は失敗しても例外を投げない)
      const leaders = await getLeaderContacts(params.productId);
      if (leaders.length > 0) {
        const reporter = await getMemberContact(task.productMemberId);
        const text = (body?.body ?? "").trim();
        await mailer.send({
          to: leaders.map((l) => l.email),
          subject: `タスクの完了報告: ${task.taskName}`,
          text: [
            `${reporter?.userName ?? "メンバー"} さんがタスク「${task.taskName}」の完了を報告しました。`,
            text ? `\n${mailPreview(text)}` : "",
            `\n${webOrigin}/products/${params.productId}`,
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
      body: t.Optional(
        t.Object({
          body: t.Optional(t.String({ maxLength: MAX_BODY_LENGTH, pattern: NO_NUL })),
        })
      ),
      response: { 200: TaskSchema, 403: MessageSchema, 404: MessageSchema, 409: MessageSchema },
      detail: { summary: "タスク完了報告(本文はやり取りのログに残る)" },
    }
  );
