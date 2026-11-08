import { SQL, and, eq } from "drizzle-orm";
import { t } from "elysia";
import { db } from "../db";
import { productDocumentVersions, productDocuments } from "../db/schema";

// 文書の応答の形と、取得の問い合わせ。ディレクトリ・文書の両方のルートが使う

export const levelSchema = () => t.Union([t.Literal("read"), t.Literal("write")]);

/** 文書の一覧に出す項目(本文は含まない)。`sizeBytes` は、いまの版の大きさ */
export const documentSummarySchema = () =>
  t.Object({
    documentId: t.String(),
    directoryId: t.String(),
    name: t.String(),
    currentVersion: t.Number(),
    sizeBytes: t.Number(),
    // true の文書は、自動削除しない
    keepForever: t.Boolean(),
    // 最後に呼び出された日時(一度もなければ null)
    lastFetchedAt: t.Nullable(t.Date()),
    updatedAt: t.Date(),
  });

/** 文書 1 件(本文つき)。`version` は、本文の版(いまの版、または指定した版) */
export const documentDetailSchema = () =>
  t.Composite([documentSummarySchema(), t.Object({ version: t.Number(), content: t.String(), canEdit: t.Boolean() })]);

const summaryColumns = {
  documentId: productDocuments.documentId,
  directoryId: productDocuments.directoryId,
  name: productDocuments.name,
  currentVersion: productDocuments.currentVersion,
  sizeBytes: productDocumentVersions.sizeBytes,
  keepForever: productDocuments.keepForever,
  lastFetchedAt: productDocuments.lastFetchedAt,
  updatedAt: productDocuments.updatedAt,
};

/** 文書の概要(いまの版の大きさつき)を、条件で選ぶ。名前の順 */
export async function selectDocumentSummaries(where: SQL | undefined) {
  return await db
    .select(summaryColumns)
    .from(productDocuments)
    .innerJoin(
      productDocumentVersions,
      and(eq(productDocumentVersions.documentId, productDocuments.documentId), eq(productDocumentVersions.version, productDocuments.currentVersion)),
    )
    .where(where)
    .orderBy(productDocuments.name);
}

export async function findDocumentSummary(documentId: string) {
  const [row] = await selectDocumentSummaries(eq(productDocuments.documentId, documentId));
  return row;
}
