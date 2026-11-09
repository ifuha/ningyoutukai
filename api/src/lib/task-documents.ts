import { and, eq, inArray, ne, or, sql } from "drizzle-orm";
import { t } from "elysia";
import { db } from "../db";
import { productDirectories, productDocuments, taskDirectories, taskDocuments, tasks } from "../db/schema";

// タスクに渡す Markdown(文書)。タスクの作成のときに結びつける。結びつけ方は 2 つ:
//   1. ディレクトリで渡す(`task_directories`): 中の文書すべてが渡る。**後から文書を足したときも渡る**
//   2. 文書を個別に渡す(`task_documents`)
// 担当者(と、担当者の AI)が、そのタスクを取ると、結びついた文書の一覧が返る。仕様は docs/v4.0/overview.md

/** 1 つのタスクに結びつけられる数の上限(文書、ディレクトリそれぞれ) */
export const MAX_TASK_LINKS = 20;

export const taskDocumentIdsSchema = () => t.Array(t.String({ format: "uuid" }), { maxItems: MAX_TASK_LINKS });
export const taskDirectoryIdsSchema = () => t.Array(t.String({ format: "uuid" }), { maxItems: MAX_TASK_LINKS });

/** タスクに渡る文書 1 件(本文は含まない。本文は `GET …/document/:documentId` で取る) */
export const TaskDocumentSchema = t.Object({
  documentId: t.String(),
  name: t.String(),
  directoryId: t.String(),
  directoryName: t.String(),
  currentVersion: t.Number(),
  // true = ディレクトリを渡したことで渡る(文書を個別にも渡していれば、false)
  viaDirectory: t.Boolean(),
});

const unique = (ids: string[]) => [...new Set(ids)];

/**
 * 結びつける先が、すべてそのプロダクトの文書・ディレクトリか確かめる。
 * 他のプロダクトのもの、存在しないものがあれば、エラーの文を返す(なければ null)
 */
export async function validateLinkTargets(productId: string, documentIds: string[], directoryIds: string[]): Promise<string | null> {
  const docs = unique(documentIds);
  const dirs = unique(directoryIds);
  if (docs.length > 0) {
    const found = await db
      .select({ documentId: productDocuments.documentId })
      .from(productDocuments)
      .where(and(eq(productDocuments.productId, productId), inArray(productDocuments.documentId, docs)));
    if (found.length !== docs.length) return "渡す文書が見つかりません";
  }
  if (dirs.length > 0) {
    const found = await db
      .select({ directoryId: productDirectories.directoryId })
      .from(productDirectories)
      .where(and(eq(productDirectories.productId, productId), inArray(productDirectories.directoryId, dirs)));
    if (found.length !== dirs.length) return "渡すディレクトリが見つかりません";
  }
  return null;
}

type Tx = Pick<typeof db, "insert" | "delete">;

/** タスクの結びつけを、渡された内容に置き換える(トランザクションの中で呼ぶ)。空なら、結びつけなし */
export async function replaceTaskLinks(tx: Tx, taskId: string, documentIds: string[], directoryIds: string[]) {
  await tx.delete(taskDocuments).where(eq(taskDocuments.taskId, taskId));
  await tx.delete(taskDirectories).where(eq(taskDirectories.taskId, taskId));
  const docs = unique(documentIds);
  const dirs = unique(directoryIds);
  if (docs.length > 0) await tx.insert(taskDocuments).values(docs.map((documentId) => ({ taskId, documentId })));
  if (dirs.length > 0) await tx.insert(taskDirectories).values(dirs.map((directoryId) => ({ taskId, directoryId })));
}

/** タスクに結びついている、ID そのもの(編集の画面が、選択の状態に使う) */
export async function getTaskLinkIds(taskId: string) {
  const documents = await db.select({ id: taskDocuments.documentId }).from(taskDocuments).where(eq(taskDocuments.taskId, taskId));
  const directories = await db.select({ id: taskDirectories.directoryId }).from(taskDirectories).where(eq(taskDirectories.taskId, taskId));
  return { documentIds: documents.map((d) => d.id), directoryIds: directories.map((d) => d.id) };
}

/**
 * タスクに渡る文書の一覧(重なりは 1 件にまとめる)。ディレクトリ、名前の順。
 * ディレクトリで渡した場合は、**いま**そのディレクトリにある文書すべて(後から足した文書も入る)
 */
export async function resolveTaskDocuments(taskId: string) {
  const columns = {
    documentId: productDocuments.documentId,
    name: productDocuments.name,
    directoryId: productDocuments.directoryId,
    directoryName: productDirectories.name,
    currentVersion: productDocuments.currentVersion,
  };
  const direct = await db
    .select(columns)
    .from(taskDocuments)
    .innerJoin(productDocuments, eq(taskDocuments.documentId, productDocuments.documentId))
    .innerJoin(productDirectories, eq(productDocuments.directoryId, productDirectories.directoryId))
    .where(eq(taskDocuments.taskId, taskId));
  const viaDirectory = await db
    .select(columns)
    .from(taskDirectories)
    .innerJoin(productDocuments, eq(productDocuments.directoryId, taskDirectories.directoryId))
    .innerJoin(productDirectories, eq(productDocuments.directoryId, productDirectories.directoryId))
    .where(eq(taskDirectories.taskId, taskId));

  const byId = new Map<string, (typeof direct)[number] & { viaDirectory: boolean }>();
  for (const d of viaDirectory) byId.set(d.documentId, { ...d, viaDirectory: true });
  // 個別にも渡している文書は、ディレクトリ経由ではない扱い(個別の指定が優先)
  for (const d of direct) byId.set(d.documentId, { ...d, viaDirectory: false });
  return [...byId.values()].sort((x, y) => x.directoryName.localeCompare(y.directoryName, "ja") || x.name.localeCompare(y.name, "ja"));
}

/** この文書が渡っているタスクの ID(直接 + ディレクトリ経由)。変更のメールの宛先(担当者)を決めるのに使う */
export async function taskIdsForDocument(documentId: string, directoryId: string): Promise<string[]> {
  const direct = await db.select({ taskId: taskDocuments.taskId }).from(taskDocuments).where(eq(taskDocuments.documentId, documentId));
  const viaDirectory = await db.select({ taskId: taskDirectories.taskId }).from(taskDirectories).where(eq(taskDirectories.directoryId, directoryId));
  return unique([...direct, ...viaDirectory].map((r) => r.taskId));
}

/**
 * この文書が、そのメンバーに「渡されている」か(そのメンバーが担当の、**未完了の**タスクに、結びついている)。
 * AI 用のトークンは、渡された文書しか取れない(`via` が `ai` のとき、文書の取得で確かめる)
 */
export async function isDocumentHandedTo(memberId: string, documentId: string, directoryId: string): Promise<boolean> {
  const [row] = await db
    .select({ taskId: tasks.taskId })
    .from(tasks)
    .where(
      and(
        eq(tasks.productMemberId, memberId),
        ne(tasks.status, "completed"),
        or(
          sql`exists (select 1 from task_documents td where td.task_id = ${tasks.taskId} and td.document_id = ${documentId})`,
          sql`exists (select 1 from task_directories tdr where tdr.task_id = ${tasks.taskId} and tdr.directory_id = ${directoryId})`,
        ),
      ),
    )
    .limit(1);
  return Boolean(row);
}
