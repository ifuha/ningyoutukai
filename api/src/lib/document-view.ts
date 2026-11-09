import { SQL, and, eq } from "drizzle-orm";
import { t } from "elysia";
import { db } from "../db";
import { documentLocks, productDocumentVersions, productDocuments, productMembers, users } from "../db/schema";
import { editingBySchema, validLockCondition } from "./document-lock";

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
    // いま編集している人(いなければ null)。ツリーの緑の点と名前。編集ロックが無効(30 分の編集なし、90 秒の途絶)になれば、null に戻る
    editingBy: editingBySchema(),
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
  editingMemberId: documentLocks.productMemberId,
  editingUserName: users.userName,
};

/** 文書の概要(いまの版の大きさつき)を、条件で選ぶ。名前の順 */
export async function selectDocumentSummaries(where: SQL | undefined) {
  const rows = await db
    .select(summaryColumns)
    .from(productDocuments)
    .innerJoin(
      productDocumentVersions,
      and(eq(productDocumentVersions.documentId, productDocuments.documentId), eq(productDocumentVersions.version, productDocuments.currentVersion)),
    )
    // 有効なロックだけを付ける(無効なロックの行は、ないのと同じ)
    .leftJoin(documentLocks, and(eq(documentLocks.documentId, productDocuments.documentId), validLockCondition()))
    .leftJoin(productMembers, eq(documentLocks.productMemberId, productMembers.productMemberId))
    .leftJoin(users, eq(productMembers.userId, users.userId))
    .where(where)
    .orderBy(productDocuments.name);
  return rows.map(({ editingMemberId, editingUserName, ...rest }) => ({
    ...rest,
    editingBy: editingMemberId && editingUserName ? { memberId: editingMemberId, userName: editingUserName } : null,
  }));
}

export async function findDocumentSummary(documentId: string) {
  const [row] = await selectDocumentSummaries(eq(productDocuments.documentId, documentId));
  return row;
}
