import { and, eq } from "drizzle-orm";
import { Elysia, t } from "elysia";
import { db } from "../../db";
import { productMembers, tasks } from "../../db/schema";
import { authGuard } from "../../lib/auth-guard";
import { getMembership } from "../../lib/product-access";
import { MessageSchema } from "../../lib/response-schema";
import { canSee, taskColumns } from "../../lib/task-view";
import {
  TaskDocumentSchema,
  getTaskLinkIds,
  replaceTaskLinks,
  resolveTaskDocuments,
  taskDirectoryIdsSchema,
  taskDocumentIdsSchema,
  validateLinkTargets,
} from "../../lib/task-documents";

// タスクに渡す Markdown(文書)。仕様は docs/v4.0/overview.md
// - 作成のときに結びつける(`POST …/task` の documentIds / directoryIds)。ここでは、あとから見る・変える
// - 見られるのは、そのタスクが見える人(担当者を含む)。変えられるのは、リーダーだけ

const params = t.Object({ productId: t.String({ format: "uuid" }), taskId: t.String({ format: "uuid" }) });

const linksSchema = () =>
  t.Object({
    // 渡る文書(個別 + ディレクトリ経由。重なりは 1 件)
    documents: t.Array(TaskDocumentSchema),
    // 結びつけの指定そのもの(編集の画面が、選択の状態に使う)
    documentIds: t.Array(t.String()),
    directoryIds: t.Array(t.String()),
  });

async function findTaskOf(productId: string, taskId: string) {
  const [task] = await db
    .select(taskColumns)
    .from(tasks)
    .innerJoin(productMembers, eq(tasks.productMemberId, productMembers.productMemberId))
    .where(and(eq(tasks.taskId, taskId), eq(productMembers.productId, productId)));
  return task;
}

export const taskDocumentLinks = new Elysia({ name: "task-documents" })
  .use(authGuard)
  // 渡る文書の一覧(本文は含まない)
  .get(
    "/api/product/:productId/task/:taskId/document",
    async ({ params, user, via, status }) => {
      const viewer = await getMembership(params.productId, user.userId);
      if (!viewer) return status(404, { message: "プロダクトが見つかりません" });
      const task = await findTaskOf(params.productId, params.taskId);
      // 見えないタスクは存在を漏らさないよう、存在しない場合と同じ 404 にする
      if (!task || !canSee(task, viewer)) return status(404, { message: "タスクが見つかりません" });
      // AI 用のトークンは、持ち主が担当のタスクだけ
      if (via === "ai" && task.productMemberId !== viewer.productMemberId) return status(404, { message: "タスクが見つかりません" });
      return { documents: await resolveTaskDocuments(task.taskId), ...(await getTaskLinkIds(task.taskId)) };
    },
    {
      requireUser: true,
      params,
      response: { 200: linksSchema(), 404: MessageSchema },
      detail: { summary: "タスクに渡る Markdown の一覧" },
    },
  )
  // 結びつけの置き換え(リーダーだけ)。空の配列で、結びつけなし
  .put(
    "/api/product/:productId/task/:taskId/document",
    async ({ params, body, user, status }) => {
      const viewer = await getMembership(params.productId, user.userId);
      if (!viewer) return status(404, { message: "プロダクトが見つかりません" });
      if (viewer.role !== "leader") return status(403, { message: "プロダクトリーダーのみ実行できます" });
      const task = await findTaskOf(params.productId, params.taskId);
      if (!task) return status(404, { message: "タスクが見つかりません" });
      const error = await validateLinkTargets(params.productId, body.documentIds, body.directoryIds);
      if (error) return status(400, { message: error });
      await db.transaction(async (tx) => {
        await replaceTaskLinks(tx, task.taskId, body.documentIds, body.directoryIds);
      });
      return { documents: await resolveTaskDocuments(task.taskId), ...(await getTaskLinkIds(task.taskId)) };
    },
    {
      requireUser: true,
      params,
      body: t.Object({ documentIds: taskDocumentIdsSchema(), directoryIds: taskDirectoryIdsSchema() }),
      response: { 200: linksSchema(), 400: MessageSchema, 403: MessageSchema, 404: MessageSchema },
      detail: { summary: "タスクに渡す Markdown の置き換え(リーダー)" },
    },
  );
