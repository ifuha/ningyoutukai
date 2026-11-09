import { Elysia, t } from "elysia";
import { db } from "../../db";
import { and, eq } from "drizzle-orm";
import { taskTypes, tasks } from "../../db/schema";
import { authGuard } from "../../lib/auth-guard";
import { mailer } from "../../lib/mailer";
import { addTaskDeadlineToGoogleCalendar } from "../../lib/google-calendar";
import {
  getMemberContact,
  getMembership,
  isMemberOfProduct,
} from "../../lib/product-access";
import {
  TIME_LIMIT_ERROR,
  descriptionSchema,
  parseTimeLimit,
  taskNameSchema,
  timeLimitSchema,
} from "../../lib/task-input";
import { MessageSchema } from "../../lib/response-schema";
import { TaskSchema, taskColumns } from "../../lib/task-view";
import {
  replaceTaskLinks,
  resolveTaskDocuments,
  taskDirectoryIdsSchema,
  taskDocumentIdsSchema,
  validateLinkTargets,
} from "../../lib/task-documents";

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

      const taskName = body.taskName.trim();
      if (!taskName) return status(400, { message: "タスク名を入力してください" });

      let timeLimit: Date | undefined;
      if (body.timeLimit !== undefined) {
        const parsed = parseTimeLimit(body.timeLimit);
        if (!parsed) return status(400, { message: TIME_LIMIT_ERROR });
        timeLimit = parsed;
      }

      if (!(await isMemberOfProduct(params.productId, body.productMemberId))) {
        return status(400, { message: "担当者はプロダクトのメンバーを指定してください" });
      }

      if (body.taskTypeId) {
        const [type] = await db
          .select({ taskTypeId: taskTypes.taskTypeId })
          .from(taskTypes)
          .where(
            and(
              eq(taskTypes.taskTypeId, body.taskTypeId),
              eq(taskTypes.productId, params.productId)
            )
          );
        if (!type) return status(400, { message: "タスクの種類が見つかりません" });
      }

      // 渡す Markdown(文書・ディレクトリ)が、このプロダクトのものか確かめる(他のプロダクトのものを渡させない)
      const documentIds = body.documentIds ?? [];
      const directoryIds = body.directoryIds ?? [];
      const linkError = await validateLinkTargets(params.productId, documentIds, directoryIds);
      if (linkError) return status(400, { message: linkError });

      // タスクと、渡す Markdown の結びつけは、同じトランザクションで書く(どちらかだけ残らないように)
      const created = await db.transaction(async (tx) => {
        const [row] = await tx
          .insert(tasks)
          .values({
            taskName,
            productMemberId: body.productMemberId,
            description: body.description,
            timeLimit,
            taskTypeId: body.taskTypeId,
            isVisible: body.isVisible,
          })
          .returning(taskColumns);
        if (documentIds.length > 0 || directoryIds.length > 0) await replaceTaskLinks(tx, row.taskId, documentIds, directoryIds);
        return row;
      });

      // カレンダー登録と通知に使う担当者の連絡先。
      const contact = await getMemberContact(created.productMemberId);

      // Google Calendar は補助機能として同期する。未連携・Google API 障害でもタスク作成は成功させる。
      if (created.timeLimit && body.timeLimit && contact?.email) {
        try {
          const calendarResult = await addTaskDeadlineToGoogleCalendar({
            email: contact.email,
            taskId: created.taskId,
            taskName: created.taskName,
            // 日時入力を維持し、開始・終了を期限時刻にそろえて登録する
            dueAt: created.timeLimit.toISOString(),
          });
          if (calendarResult === "failed") {
            console.warn(`[task-create] Google Calendar 同期失敗: ${created.taskId}`);
          } else if (calendarResult === "not-connected") {
            console.info(`[task-create] 担当者がGoogle Calendar未連携のため同期をスキップ: ${created.taskId}`);
          }
        } catch (error) {
          console.warn(`[task-create] Google Calendar 同期失敗: ${created.taskId}`, error);
        }
      }

      // 担当者へ通知(失敗してもタスク作成は成功させる。mailer は例外を投げない)
      if (contact) {
        const lines = [`タスク「${created.taskName}」があなたに割り振られました。`];
        if (created.timeLimit) lines.push(`期限: ${created.timeLimit.toISOString()}`);
        // 渡された Markdown があれば、名前を載せる(中身は載せない。開くと読める)
        const handed = await resolveTaskDocuments(created.taskId);
        if (handed.length > 0) lines.push("", "渡された文書:", ...handed.map((d) => `- ${d.directoryName}/${d.name}`));
        await mailer.send({
          to: contact.email,
          subject: `タスクが割り振られました: ${created.taskName}`,
          text: lines.join("\n"),
        });
      }

      return status(201, created);
    },
    {
      requireUser: true,
      params: t.Object({ productId: t.String({ format: "uuid" }) }),
      body: t.Object({
        taskName: taskNameSchema(),
        productMemberId: t.String({ format: "uuid" }),
        description: t.Optional(descriptionSchema()),
        timeLimit: t.Optional(timeLimitSchema()),
        taskTypeId: t.Optional(t.String({ format: "uuid" })),
        isVisible: t.Optional(t.Boolean()),
        // 渡す Markdown(任意)。文書を個別に / ディレクトリで(中の文書すべて)。どちらも付けてよい
        documentIds: t.Optional(taskDocumentIdsSchema()),
        directoryIds: t.Optional(taskDirectoryIdsSchema()),
      }),
      response: { 201: TaskSchema, 400: MessageSchema, 403: MessageSchema, 404: MessageSchema },
      detail: { summary: "タスクを追加" },
    }
  );
