import { and, asc, desc, eq, ne } from "drizzle-orm";
import { Elysia, t } from "elysia";
import { webOrigin } from "../../auth";
import { db } from "../../db";
import { productMembers, taskMessages, taskReportDrafts, tasks } from "../../db/schema";
import type { ReadDocument } from "../../db/schema";
import { authGuard } from "../../lib/auth-guard";
import { mailer } from "../../lib/mailer";
import { getLeaderContacts, getMemberContact, getMembership } from "../../lib/product-access";
import { MessageSchema } from "../../lib/response-schema";
import { nextStep } from "../../lib/task-flow";
import { resolveTaskDocuments } from "../../lib/task-documents";
import { canSee, taskColumns } from "../../lib/task-view";
import { NO_NUL } from "../../lib/validation";

// AI からの報告の下書き。仕様は docs/v4.0/overview.md
// - 保存するのは AI(AI 用のトークン)。**持ち主が担当のタスクだけ**。保存した下書きは、**担当者だけ**が見る(リーダーには見えない)
// - **担当者(人)が、確認して、完了報告に出すか判断する**: そのまま出す / 直して出す(採用)、却下
// - 採用すると、これまでの完了報告と同じ流れ(作業中・差し戻し中 → 確認待ち)になり、完了報告(または再提出)のメッセージができる。リーダーにメールで知らせる
// - 下書きには、AI が読んだ文書の名前と版を控える(あとから、どの版を読んだ下書きか分かる)

const MAX_BODY = 10000;
const MAX_PENDING = 10;
const MAX_READ_DOCUMENTS = 20;
const PREVIEW_LENGTH = 200;

const taskParams = t.Object({ productId: t.String({ format: "uuid" }), taskId: t.String({ format: "uuid" }) });
const draftParams = t.Object({ productId: t.String({ format: "uuid" }), taskId: t.String({ format: "uuid" }), draftId: t.String({ format: "uuid" }) });
const bodySchema = () => t.String({ minLength: 1, maxLength: MAX_BODY, pattern: NO_NUL });

const draftSchema = () =>
  t.Object({
    draftId: t.String(),
    taskId: t.String(),
    // 保存した AI の名前(トークンの名前)
    aiName: t.String(),
    body: t.String(),
    // AI が読んだ文書(名前と版)
    readDocuments: t.Array(t.Object({ documentId: t.String(), name: t.String(), version: t.Number() })),
    status: t.Union([t.Literal("pending"), t.Literal("adopted"), t.Literal("discarded")]),
    createdAt: t.Date(),
    decidedAt: t.Nullable(t.Date()),
  });

const view = (d: typeof taskReportDrafts.$inferSelect) => ({
  draftId: d.draftId,
  taskId: d.taskId,
  aiName: d.aiName,
  body: d.body,
  readDocuments: d.readDocuments,
  status: d.status as "pending" | "adopted" | "discarded",
  createdAt: d.createdAt,
  decidedAt: d.decidedAt,
});

const notFoundProduct = { message: "プロダクトが見つかりません" };
const notFoundTask = { message: "タスクが見つかりません" };
const notFoundDraft = { message: "下書きが見つかりません" };
const assigneeOnly = { message: "担当者のみ、下書きを確認できます" };

class Conflict extends Error {}

async function findVisibleTask(productId: string, taskId: string, viewer: NonNullable<Awaited<ReturnType<typeof getMembership>>>) {
  const [task] = await db
    .select(taskColumns)
    .from(tasks)
    .innerJoin(productMembers, eq(tasks.productMemberId, productMembers.productMemberId))
    .where(and(eq(tasks.taskId, taskId), eq(productMembers.productId, productId)));
  return task && canSee(task, viewer) ? task : undefined;
}

const preview = (text: string) => (text.length > PREVIEW_LENGTH ? `${text.slice(0, PREVIEW_LENGTH)}…` : text);

export const reportDraftEndpoints = new Elysia({ name: "task-report-drafts" })
  .use(authGuard)
  // 下書きの保存(AI 用のトークン。持ち主が担当のタスクだけ)
  .post(
    "/api/product/:productId/task/:taskId/report-draft",
    async ({ params, body, user, via, aiToken, status }) => {
      const viewer = await getMembership(params.productId, user.userId);
      if (!viewer) return status(404, notFoundProduct);
      const task = await findVisibleTask(params.productId, params.taskId, viewer);
      if (!task) return status(404, notFoundTask);
      if (via !== "ai" || !aiToken) return status(403, { message: "報告の下書きを保存できるのは、AI 用のトークンだけです" });
      // AI は、持ち主が担当のタスクだけ
      if (task.productMemberId !== viewer.productMemberId) return status(404, notFoundTask);
      if (task.status !== "in_progress" && task.status !== "rejected") {
        return status(409, { message: task.status === "completed" ? "完了済みのタスクです" : "すでに報告済みです(確認待ち)" });
      }
      const pending = await db
        .select({ draftId: taskReportDrafts.draftId })
        .from(taskReportDrafts)
        .where(and(eq(taskReportDrafts.taskId, task.taskId), eq(taskReportDrafts.status, "pending")));
      if (pending.length >= MAX_PENDING) {
        return status(409, { message: `未確認の下書きが ${MAX_PENDING} 件あります。担当者が確認してから、保存してください` });
      }

      // 読んだ文書: そのタスクに渡された文書で、版が存在するものだけ。名前と版を控える(文書が消えても残る)
      const handed = new Map((await resolveTaskDocuments(task.taskId)).map((d) => [d.documentId, d]));
      const readDocuments: ReadDocument[] = [];
      for (const r of body.readDocuments ?? []) {
        const doc = handed.get(r.documentId);
        if (!doc) return status(400, { message: "このタスクに渡されていない文書は、読んだ文書に入れられません" });
        if (r.version > doc.currentVersion) return status(400, { message: "存在しない版です" });
        if (!readDocuments.some((x) => x.documentId === r.documentId && x.version === r.version)) {
          readDocuments.push({ documentId: doc.documentId, name: `${doc.directoryName}/${doc.name}`, version: r.version });
        }
      }

      const [created] = await db
        .insert(taskReportDrafts)
        .values({ taskId: task.taskId, aiTokenId: aiToken.tokenId, aiName: aiToken.name, body: body.body.trim() || body.body, readDocuments })
        .returning();

      // 担当者に知らせる(確認して、報告に出すか判断してもらう)。mailer.send は失敗しても例外を投げないので、保存は成功させる
      await mailer.send({
        to: user.email,
        subject: `AI の報告の下書きがあります: ${task.taskName}`,
        text: [
          `AI「${aiToken.name}」が、タスク「${task.taskName}」の報告の下書きを保存しました。`,
          "内容を確認して、完了報告に出すか判断してください。",
          "",
          preview(created!.body),
          "",
          "プロダクトを開く:",
          `${webOrigin}/products/${params.productId}`,
        ].join("\n"),
      });
      return status(201, view(created!));
    },
    {
      requireUser: true,
      params: taskParams,
      body: t.Object({
        body: bodySchema(),
        readDocuments: t.Optional(t.Array(t.Object({ documentId: t.String({ format: "uuid" }), version: t.Integer({ minimum: 1 }) }), { maxItems: MAX_READ_DOCUMENTS })),
      }),
      response: { 201: draftSchema(), 400: MessageSchema, 403: MessageSchema, 404: MessageSchema, 409: MessageSchema },
      detail: { summary: "報告の下書きの保存(AI 用のトークン。持ち主が担当のタスクだけ)" },
    },
  )
  // 下書きの一覧(担当者だけ)。?status= pending(既定)/ adopted / discarded / all
  .get(
    "/api/product/:productId/task/:taskId/report-draft",
    async ({ params, query, user, status }) => {
      const viewer = await getMembership(params.productId, user.userId);
      if (!viewer) return status(404, notFoundProduct);
      const task = await findVisibleTask(params.productId, params.taskId, viewer);
      if (!task) return status(404, notFoundTask);
      if (task.productMemberId !== viewer.productMemberId) return status(403, assigneeOnly);
      const which = query.status ?? "pending";
      const rows = await db
        .select()
        .from(taskReportDrafts)
        .where(which === "all" ? eq(taskReportDrafts.taskId, task.taskId) : and(eq(taskReportDrafts.taskId, task.taskId), eq(taskReportDrafts.status, which)))
        .orderBy(desc(taskReportDrafts.createdAt), asc(taskReportDrafts.draftId));
      return rows.map(view);
    },
    {
      requireUser: true,
      params: taskParams,
      query: t.Object({ status: t.Optional(t.Union([t.Literal("pending"), t.Literal("adopted"), t.Literal("discarded"), t.Literal("all")])) }),
      response: { 200: t.Array(draftSchema()), 403: MessageSchema, 404: MessageSchema },
      detail: { summary: "報告の下書きの一覧(担当者だけ)" },
    },
  )
  // 採用 = 完了報告に出す(担当者だけ)。body を渡すと、直した本文で出す。出すと、ほかの未確認の下書きは却下になる
  .post(
    "/api/product/:productId/task/:taskId/report-draft/:draftId/adopt",
    async ({ params, body, user, status }) => {
      const viewer = await getMembership(params.productId, user.userId);
      if (!viewer) return status(404, notFoundProduct);
      const task = await findVisibleTask(params.productId, params.taskId, viewer);
      if (!task) return status(404, notFoundTask);
      if (task.productMemberId !== viewer.productMemberId) return status(403, assigneeOnly);
      const [draft] = await db
        .select()
        .from(taskReportDrafts)
        .where(and(eq(taskReportDrafts.draftId, params.draftId), eq(taskReportDrafts.taskId, task.taskId)));
      if (!draft) return status(404, notFoundDraft);
      if (draft.status !== "pending") return status(409, { message: "この下書きは、すでに確認済みです" });
      if (task.status === "completed") return status(409, { message: "すでに完了しています" });
      const step = nextStep(task.status, "report");
      if (!step.ok) return status(409, { message: "すでに報告済みです" });
      const text = (body?.body ?? draft.body).trim();
      if (!text) return status(400, { message: "報告の本文を入力してください" });

      const now = new Date();
      try {
        const adopted = await db.transaction(async (tx) => {
          // 読んだときの状態のままのときだけ進める(同時に報告されないように)
          const moved = await tx
            .update(tasks)
            .set({ status: step.next, reportedAt: now })
            .where(and(eq(tasks.taskId, task.taskId), eq(tasks.status, task.status)))
            .returning({ taskId: tasks.taskId });
          if (moved.length === 0) throw new Conflict();
          const [message] = await tx
            .insert(taskMessages)
            .values({ taskId: task.taskId, authorMemberId: viewer.productMemberId, kind: step.kind, body: text })
            .returning({ messageId: taskMessages.messageId });
          const [updated] = await tx
            .update(taskReportDrafts)
            .set({ status: "adopted", decidedAt: now, decidedBy: user.userId, adoptedMessageId: message!.messageId })
            .where(and(eq(taskReportDrafts.draftId, draft.draftId), eq(taskReportDrafts.status, "pending")))
            .returning();
          if (!updated) throw new Conflict();
          // 報告に出したので、ほかの未確認の下書きは不要になる
          await tx
            .update(taskReportDrafts)
            .set({ status: "discarded", decidedAt: now, decidedBy: user.userId })
            .where(and(eq(taskReportDrafts.taskId, task.taskId), eq(taskReportDrafts.status, "pending"), ne(taskReportDrafts.draftId, draft.draftId)));
          return updated;
        });

        // リーダー全員へメール通知(完了報告と同じ。mailer.send は失敗しても例外を投げない)
        const leaders = await getLeaderContacts(params.productId);
        if (leaders.length > 0) {
          const reporter = await getMemberContact(task.productMemberId);
          await mailer.send({
            to: leaders.map((l) => l.email),
            subject: `タスクの完了報告: ${task.taskName}`,
            text: [
              `${reporter?.userName ?? "メンバー"} さんがタスク「${task.taskName}」の完了を報告しました(AI「${draft.aiName}」の下書きをもとにしています)。`,
              "",
              preview(text),
              "",
              "プロダクトを開く:",
              `${webOrigin}/products/${params.productId}`,
            ].join("\n"),
          });
        }
        return view(adopted);
      } catch (e) {
        if (e instanceof Conflict) return status(409, { message: "すでに報告済みか、確認済みです。開き直してください" });
        throw e;
      }
    },
    {
      requireUser: true,
      params: draftParams,
      body: t.Optional(t.Object({ body: t.Optional(bodySchema()) })),
      response: { 200: draftSchema(), 400: MessageSchema, 403: MessageSchema, 404: MessageSchema, 409: MessageSchema },
      detail: { summary: "報告の下書きを採用して、完了報告に出す(担当者だけ)" },
    },
  )
  // 却下(担当者だけ)。AI にやり直させたいときなど
  .post(
    "/api/product/:productId/task/:taskId/report-draft/:draftId/discard",
    async ({ params, user, status }) => {
      const viewer = await getMembership(params.productId, user.userId);
      if (!viewer) return status(404, notFoundProduct);
      const task = await findVisibleTask(params.productId, params.taskId, viewer);
      if (!task) return status(404, notFoundTask);
      if (task.productMemberId !== viewer.productMemberId) return status(403, assigneeOnly);
      const [draft] = await db
        .select()
        .from(taskReportDrafts)
        .where(and(eq(taskReportDrafts.draftId, params.draftId), eq(taskReportDrafts.taskId, task.taskId)));
      if (!draft) return status(404, notFoundDraft);
      const [updated] = await db
        .update(taskReportDrafts)
        .set({ status: "discarded", decidedAt: new Date(), decidedBy: user.userId })
        .where(and(eq(taskReportDrafts.draftId, draft.draftId), eq(taskReportDrafts.status, "pending")))
        .returning();
      if (!updated) return status(409, { message: "この下書きは、すでに確認済みです" });
      return view(updated);
    },
    {
      requireUser: true,
      params: draftParams,
      response: { 200: draftSchema(), 403: MessageSchema, 404: MessageSchema, 409: MessageSchema },
      detail: { summary: "報告の下書きの却下(担当者だけ)" },
    },
  );
