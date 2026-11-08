import { and, eq } from "drizzle-orm";
import { t } from "elysia";
import { db } from "../db";
import { directoryPermissions, productDirectories, productDocuments } from "../db/schema";
import type { DocumentLevel } from "./document-authorize";

/** 1 つの文書の本文の上限(バイト。1MB。アイコンと同じ) */
export const DOCUMENT_MAX_BYTES = 1_048_576;

/** 名前に使えない文字: `/`、`\`、NUL。前後に空白は付けない。ディレクトリ名は 1〜100 文字 */
const NAME_PATTERN = "^(?!\\s)(?!.*\\s$)[^/\\\\\\u0000]+$";
export const directoryNameSchema = () => t.String({ minLength: 1, maxLength: 100, pattern: NAME_PATTERN });
/** 文書の名前: 1〜100 文字で、`.md` で終わる(Markdown だけ) */
export const documentNameSchema = () => t.String({ minLength: 1, maxLength: 100, pattern: "^(?!\\s)[^/\\\\\\u0000]+\\.md$" });
/** 本文(Markdown)。NUL は入れない。大きさは、バイト数で別に確かめる(`DOCUMENT_MAX_BYTES`) */
export const documentContentSchema = () => t.String({ pattern: "^[^\\u0000]*$" });

/** 本文のバイト数(UTF-8) */
export const byteLength = (content: string) => new TextEncoder().encode(content).byteLength;

/**
 * R2 のキー: `<productId>/<documentId>/v<版>.md`。ファイル名を変えても、キーは変えない。
 * 利用者の入力(名前)をキーに使わない(フォルダの外へ出るキーを作らせない)
 */
export const documentKey = (productId: string, documentId: string, version: number) => `${productId}/${documentId}/v${version}.md`;

/** メンバーの、そのディレクトリでの権限の設定(なければ null)。リーダーの判定は `documentAuthorize` が行う */
export async function permissionOf(directoryId: string, productMemberId: string): Promise<DocumentLevel | null> {
  const [row] = await db
    .select({ level: directoryPermissions.level })
    .from(directoryPermissions)
    .where(and(eq(directoryPermissions.directoryId, directoryId), eq(directoryPermissions.productMemberId, productMemberId)));
  return row?.level ?? null;
}

/** プロダクトの中のディレクトリ。なければ undefined(他のプロダクトのディレクトリも、なし扱い) */
export async function findDirectory(productId: string, directoryId: string) {
  const [row] = await db
    .select()
    .from(productDirectories)
    .where(and(eq(productDirectories.productId, productId), eq(productDirectories.directoryId, directoryId)));
  return row;
}

/** プロダクトの中の文書。なければ undefined(他のプロダクトの文書も、なし扱い) */
export async function findDocument(productId: string, documentId: string) {
  const [row] = await db
    .select()
    .from(productDocuments)
    .where(and(eq(productDocuments.productId, productId), eq(productDocuments.documentId, documentId)));
  return row;
}
