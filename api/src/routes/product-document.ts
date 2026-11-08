import { and, asc, desc, eq, isNull, lt, or } from "drizzle-orm";
import { Elysia, t } from "elysia";
import { db } from "../db";
import { productDocumentVersions, productDocuments, products, users } from "../db/schema";
import { authGuard } from "../lib/auth-guard";
import {
  DOCUMENT_MAX_BYTES,
  byteLength,
  documentContentSchema,
  documentKey,
  newAttemptId,
  documentNameSchema,
  findDirectory,
  findDocument,
  permissionOf,
} from "../lib/document-access";
import { documentAuthorizer } from "../lib/document-authorize";
import { notifyDocumentChanged } from "../lib/document-mail";
import { LOCK_WARN_BEFORE_MS, acquireLock, findValidLock, heartbeatLock, lockIdleMsLeft, lockMsLeft, releaseLock } from "../lib/document-lock";
import { documentDetailSchema, documentSummarySchema, findDocumentSummary } from "../lib/document-view";
import { getMembership, type Membership } from "../lib/product-access";
import { isDocumentHandedTo } from "../lib/task-documents";
import { MessageSchema } from "../lib/response-schema";
import { isUniqueViolation } from "../lib/task-kind";
import type { ObjectStorage } from "../lib/storage";
import { documentObjectStorage } from "../lib/storage-plugin";

// 文書(Markdown)。本文は R2(文書用の非公開バケット)、名前・版・置き場所は DB。仕様は docs/v4.0/overview.md
// - 読めるのは、プロダクトの参加者全員。書き込み(作成・保存・名前の変更や移動・削除)は、そのディレクトリの書き込み権限がある人(リーダーは常に)
// - 保存のたびに新しい版になる(前の版は残す)。保存には、開いたときの版(baseVersion)が要る。違えば 409(他の人が先に保存した)
// - 呼び出された日時(lastFetchedAt)を、取得のたびに更新する(1 時間以内の続けての更新は、書き込まずに間引く)
// - 編集ロック: 同時に編集はできない(`document-lock.ts`)。他の人が編集中の文書は、保存・名前の変更・移動・削除ができない(409)。保存すると、自分のロックは外れる
// 変更のメールは、別の PR で足す

const productParams = t.Object({ productId: t.String({ format: "uuid" }) });
const directoryParams = t.Object({ productId: t.String({ format: "uuid" }), directoryId: t.String({ format: "uuid" }) });
const documentParams = t.Object({ productId: t.String({ format: "uuid" }), documentId: t.String({ format: "uuid" }) });

const notFoundProduct = { message: "プロダクトが見つかりません" };
const notFoundDirectory = { message: "ディレクトリが見つかりません" };
const notFoundDocument = { message: "文書が見つかりません" };
const forbiddenWrite = { message: "このディレクトリの文書を変更する権限がありません" };
const tooLarge = { message: "文書は 1MB 以下にしてください" };
const duplicateName = { message: "同じ名前の文書があります" };
const staleVersion = { message: "他の人が先に保存しました。開き直してください" };

/** 呼び出しの更新を間引く間隔(ms)。画面で開くたびに書き込まないように */
const FETCH_TOUCH_INTERVAL_MS = 60 * 60 * 1000;

class VersionConflict extends Error {}

/** 他の人が持っている、有効な編集ロック(なければ undefined。自分のロックは、他の人ではない) */
async function otherEditor(documentId: string, memberId: string) {
  const lock = await findValidLock(documentId);
  return lock && lock.memberId !== memberId ? lock : undefined;
}
const editingMessage = (userName: string) => ({ message: `${userName} さんが編集中です` });

/**
 * ロックの応答。`idleMsLeft` = 「30 分の編集なし」で外れるまで、あと何ミリ秒か。画面は、これが `warnBeforeMs`(1 分)以下になったら、予告を出す。
 * `msLeft` = ハートビートの途絶(90 秒)も含めて、いちばん早く外れるまで、あと何ミリ秒か
 */
const lockSchema = () =>
  t.Object({
    held: t.Literal(true),
    idleMsLeft: t.Number(),
    msLeft: t.Number(),
    warnBeforeMs: t.Number(),
    lockedBy: t.Object({ memberId: t.String(), userName: t.String() }),
  });
/** ロックが取れない・外れている、ときの応答。`reason`: taken = 他の人が編集中 / released = ロックが外れている(30 分の編集なし、通信の途絶) */
const lockConflictSchema = () =>
  t.Object({
    message: t.String(),
    reason: t.Union([t.Literal("taken"), t.Literal("released")]),
    lockedBy: t.Nullable(t.Object({ memberId: t.String(), userName: t.String() })),
  });

async function deleteQuietly(storage: ObjectStorage, key: string) {
  try {
    await storage.delete(key);
  } catch (e) {
    console.warn(`[product-document] 文書の本文を消せませんでした: ${key}`, e);
  }
}

/** そのディレクトリで、見ている人が書き込めるか(リーダーは常に。それ以外は設定の行) */
async function canWriteIn(
  membership: Membership,
  directoryId: string,
  can: { canWrite: (permission: "read" | "write" | null | undefined) => boolean },
) {
  const permission = membership.role === "leader" ? null : await permissionOf(directoryId, membership.productMemberId);
  return can.canWrite(permission);
}

async function readContent(storage: ObjectStorage, key: string): Promise<string | null> {
  const object = await storage.get(key);
  return object ? await new Response(object.body).text() : null;
}

/** 呼び出された日時を更新する。前の更新から 1 時間以内なら書き込まない */
async function touchFetched(documentId: string) {
  const threshold = new Date(Date.now() - FETCH_TOUCH_INTERVAL_MS);
  await db
    .update(productDocuments)
    .set({ lastFetchedAt: new Date() })
    .where(and(eq(productDocuments.documentId, documentId), or(isNull(productDocuments.lastFetchedAt), lt(productDocuments.lastFetchedAt, threshold))));
}

export const productDocumentRoutes = new Elysia({ name: "product-document" })
  .use(authGuard)
  .use(documentObjectStorage)
  .use(documentAuthorizer)
  // 作成: ディレクトリの書き込み権限が要る。版 1 ができる
  .post(
    "/api/product/:productId/directory/:directoryId/document",
    async ({ params, body, user, documentStorage, documentAuthorize, status }) => {
      const membership = await getMembership(params.productId, user.userId);
      if (!membership) return status(404, notFoundProduct);
      const directory = await findDirectory(params.productId, params.directoryId);
      if (!directory) return status(404, notFoundDirectory);
      const can = documentAuthorize({ role: membership.role });
      if (!(await canWriteIn(membership, params.directoryId, can))) return status(403, forbiddenWrite);
      const size = byteLength(body.content);
      if (size > DOCUMENT_MAX_BYTES) return status(413, tooLarge);

      const documentId = crypto.randomUUID();
      const key = documentKey(params.productId, documentId, 1);
      // (1) 本文を R2 に保存する (2) DB に行を足す。DB が失敗したら、保存した本文を消す
      try {
        await documentStorage.put(key, body.content, { contentType: "text/markdown; charset=utf-8" });
      } catch (e) {
        console.error("[product-document] 本文を保存できませんでした", e);
        return status(500, { message: "文書を保存できませんでした" });
      }
      try {
        await db.transaction(async (tx) => {
          await tx.insert(productDocuments).values({
            documentId,
            productId: params.productId,
            directoryId: params.directoryId,
            name: body.name,
            createdBy: user.userId,
          });
          await tx.insert(productDocumentVersions).values({ documentId, version: 1, r2Key: key, sizeBytes: size, createdBy: user.userId });
        });
      } catch (e) {
        await deleteQuietly(documentStorage, key);
        if (isUniqueViolation(e)) return status(409, duplicateName);
        throw e;
      }
      const summary = (await findDocumentSummary(documentId))!;
      return status(201, { ...summary, version: 1, content: body.content, canEdit: true });
    },
    {
      requireUser: true,
      params: directoryParams,
      body: t.Object({ name: documentNameSchema(), content: documentContentSchema() }),
      response: { 201: documentDetailSchema(), 403: MessageSchema, 404: MessageSchema, 409: MessageSchema, 413: MessageSchema, 500: MessageSchema },
      detail: { summary: "文書の作成(ディレクトリの書き込み権限)" },
    },
  )
  // 取得: 参加者全員。?version=N で前の版。呼び出された日時を更新する(CLI / API でも、画面でも)
  .get(
    "/api/product/:productId/document/:documentId",
    async ({ params, query, user, via, documentStorage, documentAuthorize, status }) => {
      const membership = await getMembership(params.productId, user.userId);
      if (!membership) return status(404, notFoundProduct);
      const doc = await findDocument(params.productId, params.documentId);
      if (!doc) return status(404, notFoundDocument);
      // AI 用のトークンは、持ち主が担当の(未完了の)タスクに渡された文書だけ取れる
      if (via === "ai" && !(await isDocumentHandedTo(membership.productMemberId, doc.documentId, doc.directoryId))) {
        return status(404, notFoundDocument);
      }
      const version = query.version ?? doc.currentVersion;
      const [row] = await db
        .select()
        .from(productDocumentVersions)
        .where(and(eq(productDocumentVersions.documentId, doc.documentId), eq(productDocumentVersions.version, version)));
      if (!row) return status(404, { message: "その版は見つかりません" });
      const content = await readContent(documentStorage, row.r2Key);
      if (content === null) {
        console.error(`[product-document] 本文が R2 に見つかりません: ${row.r2Key}`);
        return status(500, { message: "文書の本文を読み出せませんでした" });
      }
      await touchFetched(doc.documentId);
      const summary = (await findDocumentSummary(doc.documentId))!;
      const can = documentAuthorize({ role: membership.role });
      return { ...summary, version, content, canEdit: await canWriteIn(membership, doc.directoryId, can) };
    },
    {
      requireUser: true,
      params: documentParams,
      query: t.Object({ version: t.Optional(t.Numeric({ minimum: 1 })) }),
      response: { 200: documentDetailSchema(), 404: MessageSchema, 500: MessageSchema },
      detail: { summary: "文書の取得(参加者全員。本文つき)" },
    },
  )
  // 版の一覧(新しい順): 参加者全員
  .get(
    "/api/product/:productId/document/:documentId/version",
    async ({ params, user, status }) => {
      const membership = await getMembership(params.productId, user.userId);
      if (!membership) return status(404, notFoundProduct);
      const doc = await findDocument(params.productId, params.documentId);
      if (!doc) return status(404, notFoundDocument);
      return await db
        .select({
          version: productDocumentVersions.version,
          sizeBytes: productDocumentVersions.sizeBytes,
          createdAt: productDocumentVersions.createdAt,
          authorName: users.userName,
        })
        .from(productDocumentVersions)
        .leftJoin(users, eq(productDocumentVersions.createdBy, users.userId))
        .where(eq(productDocumentVersions.documentId, doc.documentId))
        .orderBy(desc(productDocumentVersions.version));
    },
    {
      requireUser: true,
      params: documentParams,
      response: {
        200: t.Array(t.Object({ version: t.Number(), sizeBytes: t.Number(), createdAt: t.Date(), authorName: t.Nullable(t.String()) })),
        404: MessageSchema,
      },
      detail: { summary: "文書の版の一覧(参加者全員)" },
    },
  )
  // 保存: 新しい版ができる。baseVersion = 開いたときの版。いまの版と違えば 409
  .put(
    "/api/product/:productId/document/:documentId",
    async ({ params, body, user, documentStorage, documentAuthorize, status }) => {
      const membership = await getMembership(params.productId, user.userId);
      if (!membership) return status(404, notFoundProduct);
      const doc = await findDocument(params.productId, params.documentId);
      if (!doc) return status(404, notFoundDocument);
      const can = documentAuthorize({ role: membership.role });
      if (!(await canWriteIn(membership, doc.directoryId, can))) return status(403, forbiddenWrite);
      const size = byteLength(body.content);
      if (size > DOCUMENT_MAX_BYTES) return status(413, tooLarge);
      if (body.baseVersion !== doc.currentVersion) return status(409, staleVersion);
      const editor = await otherEditor(doc.documentId, membership.productMemberId);
      if (editor) return status(409, editingMessage(editor.userName));

      const next = doc.currentVersion + 1;
      // 試行ごとに違うキー(同時に保存した負けた側が、後始末で、勝った側の本文を消さないように)
      const key = documentKey(params.productId, doc.documentId, next, newAttemptId());
      try {
        await documentStorage.put(key, body.content, { contentType: "text/markdown; charset=utf-8" });
      } catch (e) {
        console.error("[product-document] 本文を保存できませんでした", e);
        return status(500, { message: "文書を保存できませんでした" });
      }
      try {
        await db.transaction(async (tx) => {
          // 開いたときの版のままのときだけ進める(同時の保存で、版が重ならないように)
          const updated = await tx
            .update(productDocuments)
            .set({ currentVersion: next, updatedAt: new Date() })
            .where(and(eq(productDocuments.documentId, doc.documentId), eq(productDocuments.currentVersion, body.baseVersion)))
            .returning({ documentId: productDocuments.documentId });
          if (updated.length === 0) throw new VersionConflict();
          await tx.insert(productDocumentVersions).values({ documentId: doc.documentId, version: next, r2Key: key, sizeBytes: size, createdBy: user.userId });
        });
      } catch (e) {
        await deleteQuietly(documentStorage, key);
        if (e instanceof VersionConflict || isUniqueViolation(e)) return status(409, staleVersion);
        throw e;
      }
      const summary = (await findDocumentSummary(doc.documentId))!;
      // 保存すると、自分のロックは外れる(続けて編集するときは、取り直す)
      await releaseLock(doc.documentId, membership.productMemberId);
      // 要件が変わったことを、この文書が割り振られたメンバーに、メールで知らせる(`notify: false` で送らない。誤字の直しなど)。
      // mailer.send は失敗しても例外を投げないので、保存は成功させる
      if (body.notify !== false) {
        await notifyDocumentChanged({
          productId: params.productId,
          documentId: doc.documentId,
          directoryId: doc.directoryId,
          documentName: doc.name,
          version: next,
          editorName: user.userName,
          editorMemberId: membership.productMemberId,
        });
      }
      return { ...summary, version: next, content: body.content, canEdit: true };
    },
    {
      requireUser: true,
      params: documentParams,
      // notify: この保存を、割り振られたメンバーにメールで知らせるか(省略は、知らせる)
      body: t.Object({ content: documentContentSchema(), baseVersion: t.Integer({ minimum: 1 }), notify: t.Optional(t.Boolean()) }),
      response: { 200: documentDetailSchema(), 403: MessageSchema, 404: MessageSchema, 409: MessageSchema, 413: MessageSchema, 500: MessageSchema },
      detail: { summary: "文書の保存(新しい版。ディレクトリの書き込み権限)" },
    },
  )
  // 名前の変更・別のディレクトリへの移動(どちらも書き込み権限が要る。移動は、移し先の書き込み権限も要る)/ 「自動削除しない」の切り替え(リーダーだけ)
  .patch(
    "/api/product/:productId/document/:documentId",
    async ({ params, body, user, documentAuthorize, status }) => {
      const membership = await getMembership(params.productId, user.userId);
      if (!membership) return status(404, notFoundProduct);
      const doc = await findDocument(params.productId, params.documentId);
      if (!doc) return status(404, notFoundDocument);
      const can = documentAuthorize({ role: membership.role });

      if (body.name !== undefined || body.directoryId !== undefined) {
        if (!(await canWriteIn(membership, doc.directoryId, can))) return status(403, forbiddenWrite);
        // 他の人が編集している間は、名前の変更も移動もしない
        const editor = await otherEditor(doc.documentId, membership.productMemberId);
        if (editor) return status(409, editingMessage(editor.userName));
      }
      if (body.directoryId !== undefined && body.directoryId !== doc.directoryId) {
        const target = await findDirectory(params.productId, body.directoryId);
        if (!target) return status(404, notFoundDirectory);
        if (!(await canWriteIn(membership, body.directoryId, can))) return status(403, forbiddenWrite);
      }
      if (body.keepForever !== undefined && !can.canManage()) {
        return status(403, { message: "「自動削除しない」を変えられるのは、プロダクトリーダーだけです" });
      }

      try {
        await db
          .update(productDocuments)
          .set({
            ...(body.name !== undefined ? { name: body.name } : {}),
            ...(body.directoryId !== undefined ? { directoryId: body.directoryId } : {}),
            ...(body.keepForever !== undefined ? { keepForever: body.keepForever } : {}),
            updatedAt: new Date(),
          })
          .where(eq(productDocuments.documentId, doc.documentId));
      } catch (e) {
        if (isUniqueViolation(e)) return status(409, duplicateName);
        throw e;
      }
      return (await findDocumentSummary(doc.documentId))!;
    },
    {
      requireUser: true,
      params: documentParams,
      body: t.Object(
        { name: t.Optional(documentNameSchema()), directoryId: t.Optional(t.String({ format: "uuid" })), keepForever: t.Optional(t.Boolean()) },
        { minProperties: 1 },
      ),
      response: { 200: documentSummarySchema(), 403: MessageSchema, 404: MessageSchema, 409: MessageSchema },
      detail: { summary: "文書の名前変更・移動(書き込み権限)/ 自動削除しない(リーダー)" },
    },
  )
  // 削除: 書き込み権限が要る。全ての版を消す(R2 の本文も)
  .delete(
    "/api/product/:productId/document/:documentId",
    async ({ params, user, documentStorage, documentAuthorize, status }) => {
      const membership = await getMembership(params.productId, user.userId);
      if (!membership) return status(404, notFoundProduct);
      const doc = await findDocument(params.productId, params.documentId);
      if (!doc) return status(404, notFoundDocument);
      const can = documentAuthorize({ role: membership.role });
      if (!(await canWriteIn(membership, doc.directoryId, can))) return status(403, forbiddenWrite);

      // 他の人が編集している間は、消さない
      const editor = await otherEditor(doc.documentId, membership.productMemberId);
      if (editor) return status(409, editingMessage(editor.userName));

      // 行が消えるとキーが読めなくなるので、削除の前に読んでおく
      const versions = await db
        .select({ r2Key: productDocumentVersions.r2Key })
        .from(productDocumentVersions)
        .where(eq(productDocumentVersions.documentId, doc.documentId))
        .orderBy(asc(productDocumentVersions.version));
      await db.delete(productDocuments).where(eq(productDocuments.documentId, doc.documentId));
      // DB の削除が成功したあとで、R2 の本文も消す(消せなくても、削除は成功させる)
      for (const v of versions) await deleteQuietly(documentStorage, v.r2Key);
      return status(204, undefined);
    },
    {
      requireUser: true,
      params: documentParams,
      response: { 204: t.Undefined(), 403: MessageSchema, 404: MessageSchema, 409: MessageSchema },
      detail: { summary: "文書の削除(ディレクトリの書き込み権限。全ての版を消す。他の人が編集中は 409)" },
    },
  )
  // ---- 自動削除の設定(プロダクトの設定。リーダーだけ) ----
  // 最後に呼び出されてから何日で、文書を自動で削除するか(初期 7 日)。「自動削除しない」は、文書ごと(PATCH …/document/:documentId の keepForever)
  .patch(
    "/api/product/:productId/document-setting",
    async ({ params, body, user, documentAuthorize, status }) => {
      const membership = await getMembership(params.productId, user.userId);
      if (!membership) return status(404, notFoundProduct);
      if (!documentAuthorize({ role: membership.role }).canManage()) return status(403, { message: "プロダクトリーダーのみ実行できます" });
      const [updated] = await db
        .update(products)
        .set({ documentAutoDeleteDays: body.documentAutoDeleteDays })
        .where(eq(products.productId, params.productId))
        .returning({ documentAutoDeleteDays: products.documentAutoDeleteDays });
      if (!updated) return status(404, notFoundProduct);
      return updated;
    },
    {
      requireUser: true,
      params: productParams,
      body: t.Object({ documentAutoDeleteDays: t.Integer({ minimum: 1, maximum: 3650 }) }),
      response: { 200: t.Object({ documentAutoDeleteDays: t.Number() }), 403: MessageSchema, 404: MessageSchema },
      detail: { summary: "文書の自動削除までの日数(リーダー)" },
    },
  )
  // ---- 編集ロック ----
  // 取る: 書き込み権限が要る。だれも編集していない(または前のロックが外れている)ときに取れる。自分のロックなら、取り直せる(続けて編集)。他の人が編集中なら 409
  .post(
    "/api/product/:productId/document/:documentId/lock",
    async ({ params, user, documentAuthorize, status }) => {
      const membership = await getMembership(params.productId, user.userId);
      if (!membership) return status(404, notFoundProduct);
      const doc = await findDocument(params.productId, params.documentId);
      if (!doc) return status(404, notFoundDocument);
      const can = documentAuthorize({ role: membership.role });
      if (!(await canWriteIn(membership, doc.directoryId, can))) return status(403, forbiddenWrite);
      const row = await acquireLock(doc.documentId, membership.productMemberId);
      if (!row) {
        const editor = await findValidLock(doc.documentId);
        return status(409, {
          ...editingMessage(editor?.userName ?? "他の人"),
          reason: "taken" as const,
          lockedBy: editor ? { memberId: editor.memberId, userName: editor.userName } : null,
        });
      }
      return { held: true as const, idleMsLeft: lockIdleMsLeft(row), msLeft: lockMsLeft(row), warnBeforeMs: LOCK_WARN_BEFORE_MS, lockedBy: { memberId: membership.productMemberId, userName: user.userName } };
    },
    {
      requireUser: true,
      params: documentParams,
      response: { 200: lockSchema(), 403: MessageSchema, 404: MessageSchema, 409: lockConflictSchema() },
      detail: { summary: "編集ロックを取る(書き込み権限。他の人が編集中は 409)" },
    },
  )
  // 知らせ(ハートビート): 画面が編集中、一定間隔(例: 30 秒)で呼ぶ。`edited` = 前回から今回の間に、内容を編集したか。
  // 外れていたら 409(reason = released: 30 分の編集なし・通信の途絶 / taken: 他の人が取った)。画面は、「ロックが解除されました」と知らせる
  .put(
    "/api/product/:productId/document/:documentId/lock",
    async ({ params, body, user, status }) => {
      const membership = await getMembership(params.productId, user.userId);
      if (!membership) return status(404, notFoundProduct);
      const doc = await findDocument(params.productId, params.documentId);
      if (!doc) return status(404, notFoundDocument);
      const row = await heartbeatLock(doc.documentId, membership.productMemberId, body.edited);
      if (!row) {
        const editor = await findValidLock(doc.documentId);
        // 他の人が編集中 = taken。だれも持っていない(外れた) = released
        if (editor && editor.memberId !== membership.productMemberId) {
          return status(409, { ...editingMessage(editor.userName), reason: "taken" as const, lockedBy: { memberId: editor.memberId, userName: editor.userName } });
        }
        return status(409, { message: "編集ロックが解除されました", reason: "released" as const, lockedBy: null });
      }
      return { held: true as const, idleMsLeft: lockIdleMsLeft(row), msLeft: lockMsLeft(row), warnBeforeMs: LOCK_WARN_BEFORE_MS, lockedBy: { memberId: membership.productMemberId, userName: user.userName } };
    },
    {
      requireUser: true,
      params: documentParams,
      body: t.Object({ edited: t.Boolean() }),
      response: { 200: lockSchema(), 404: MessageSchema, 409: lockConflictSchema() },
      detail: { summary: "編集ロックの知らせ(ハートビート)。外れていたら 409" },
    },
  )
  // 外す(編集をやめたとき): 自分のロックだけ。なくても 204(何度呼んでもよい)
  .delete(
    "/api/product/:productId/document/:documentId/lock",
    async ({ params, user, status }) => {
      const membership = await getMembership(params.productId, user.userId);
      if (!membership) return status(404, notFoundProduct);
      const doc = await findDocument(params.productId, params.documentId);
      if (!doc) return status(404, notFoundDocument);
      await releaseLock(doc.documentId, membership.productMemberId);
      return status(204, undefined);
    },
    {
      requireUser: true,
      params: documentParams,
      response: { 204: t.Undefined(), 404: MessageSchema },
      detail: { summary: "編集ロックを外す(自分のロックだけ)" },
    },
  );
