import { and, asc, eq, or } from "drizzle-orm";
import { Elysia, t } from "elysia";
import { db } from "../db";
import { productNotes, products, users } from "../db/schema";
import { authGuard } from "../lib/auth-guard";
import { noteAuthorize } from "../lib/note-authorize";
import { webOrigin } from "../auth";
import { mailer } from "../lib/mailer";
import { getMemberContactsExcept, getMembership } from "../lib/product-access";
import { MessageSchema } from "../lib/response-schema";
import { coordSchema } from "../lib/section-input";

const params = t.Object({ productId: t.String({ format: "uuid" }) });
const noteParams = t.Object({ productId: t.String({ format: "uuid" }), noteId: t.String({ format: "uuid" }) });
const noteSchema = t.Object({
  noteId: t.String(), productId: t.String(), content: t.String(), x: t.Number(), y: t.Number(),
  authorName: t.Union([t.String(), t.Null()]), createdBy: t.Union([t.String(), t.Null()]), isPublic: t.Boolean(),
  // 見ている人が、変更・削除・公開の切り替えをできるか(画面が、メニューの項目を出し分けるのに使う)
  canEdit: t.Boolean(),
  createdAt: t.Date(), updatedAt: t.Date(),
});
const noteListSchema = t.Array(noteSchema);
const notFound = { message: "プロダクトまたはメモが見つかりません" };
const forbiddenEdit = { message: "他の人のメモは変更できません" };
const forbiddenDelete = { message: "他の人のメモは削除できません" };

// 返す列。作成者の名前は users と LEFT JOIN で引く(作成者が NULL = 退会した人・列を足す前のメモは null)
const noteColumns = {
  noteId: productNotes.noteId, productId: productNotes.productId, content: productNotes.content, x: productNotes.x, y: productNotes.y,
  authorName: users.userName, createdBy: productNotes.createdBy, isPublic: productNotes.isPublic,
  createdAt: productNotes.createdAt, updatedAt: productNotes.updatedAt,
};

/**
 * 見えるメモの条件: 公開、または自分が作成者。他人の非公開メモは含まない。
 * 作成者が NULL(退会した人・作成者を保存する前のメモ)の非公開メモは、持ち主がいないので、誰にも見えない(他人に見せない)。
 * product-revision.ts も同じ条件を使う
 */
export function visibleNoteFilter(userId: string) {
  return or(eq(productNotes.isPublic, true), eq(productNotes.createdBy, userId));
}

type NoteRow = { isPublic: boolean; createdBy: string | null };

const isVisible = (note: NoteRow, userId: string) => note.isPublic || note.createdBy === userId;

async function findNote(noteId: string) {
  const [note] = await db.select(noteColumns).from(productNotes).leftJoin(users, eq(productNotes.createdBy, users.userId)).where(eq(productNotes.noteId, noteId));
  return note;
}

/** メール本文に載せるメモの内容の長さ(これを超えたら省略する) */
const MAIL_PREVIEW_LENGTH = 200;

/**
 * メモを非公開から公開に切り替えたとき、ほかのメンバー全員へメールで知らせる(切り替えた本人には送らない)。
 * mailer.send は失敗しても例外を投げないので、メモの更新は成功させる
 */
async function notifyNotePublished(args: { productId: string; publisherUserId: string; publisherName: string; content: string }) {
  const recipients = await getMemberContactsExcept(args.productId, args.publisherUserId);
  if (recipients.length === 0) return;
  const [product] = await db.select({ productName: products.productName }).from(products).where(eq(products.productId, args.productId));
  const productName = product?.productName ?? "プロダクト";
  const preview = args.content.length > MAIL_PREVIEW_LENGTH ? `${args.content.slice(0, MAIL_PREVIEW_LENGTH)}…` : args.content;
  const lines = [`${args.publisherName} さんが、プロダクト「${productName}」のメモを公開しました。`];
  if (preview.trim()) lines.push("", preview);
  lines.push("", `${webOrigin}/products/${args.productId}`);
  await mailer.send({ to: recipients.map((r) => r.email), subject: `メモが公開されました: ${productName}`, text: lines.join("\n") });
}

export const productNoteRoutes = new Elysia({ name: "product-note" }).use(authGuard).use(noteAuthorize)
  .get("/api/product/:productId/note", async ({ params, user, authorize, status }) => {
    const membership = await getMembership(params.productId, user.userId);
    if (!membership) return status(404, { message: "プロダクトが見つかりません" });
    const rows = await db.select(noteColumns).from(productNotes).leftJoin(users, eq(productNotes.createdBy, users.userId))
      .where(and(eq(productNotes.productId, params.productId), visibleNoteFilter(user.userId)))
      .orderBy(asc(productNotes.createdAt), asc(productNotes.noteId));
    const can = authorize({ userId: user.userId, role: membership.role });
    return rows.map((n) => ({ ...n, canEdit: can.canEdit(n) }));
  }, { requireUser: true, params, response: { 200: noteListSchema, 404: MessageSchema }, detail: { summary: "メモ一覧取得(公開と自分のメモ)" } })
  .post("/api/product/:productId/note", async ({ params, body, user, authorize, status }) => {
    const membership = await getMembership(params.productId, user.userId);
    if (!membership) return status(404, { message: "プロダクトが見つかりません" });
    // isPublic は DB の既定(非公開)のまま。公開は PATCH で作成者が切り替える
    const [created] = await db.insert(productNotes).values({ productId: params.productId, createdBy: user.userId, x: body.x, y: body.y }).returning({ noteId: productNotes.noteId });
    const note = (await findNote(created.noteId))!;
    return status(201, { ...note, canEdit: authorize({ userId: user.userId, role: membership.role }).canEdit(note) });
  }, { requireUser: true, params, body: t.Object({ x: coordSchema(), y: coordSchema() }), response: { 201: noteSchema, 404: MessageSchema }, detail: { summary: "メモ作成" } })
  .patch("/api/product/:productId/note/:noteId", async ({ params, body, user, authorize, status }) => {
    const membership = await getMembership(params.productId, user.userId);
    if (!membership) return status(404, notFound);
    const note = await findNote(params.noteId);
    // 他人の非公開メモは存在を漏らさないよう、無いのと同じ 404 にする
    if (!note || note.productId !== params.productId || !isVisible(note, user.userId)) return status(404, notFound);
    // 変更できるのは作成者だけ(作成者が NULL のメモは、リーダーだけ)
    const can = authorize({ userId: user.userId, role: membership.role });
    if (!can.canEdit(note)) return status(403, forbiddenEdit);
    await db.update(productNotes).set({ ...body, updatedAt: new Date() }).where(eq(productNotes.noteId, params.noteId));
    const updated = await findNote(params.noteId);
    // 非公開 → 公開に切り替えたときだけ、ほかのメンバーへ知らせる
    if (updated && body.isPublic === true && !note.isPublic) {
      await notifyNotePublished({ productId: params.productId, publisherUserId: user.userId, publisherName: user.userName, content: updated.content });
    }
    return updated ? { ...updated, canEdit: can.canEdit(updated) } : status(404, notFound);
  }, { requireUser: true, params: noteParams, body: t.Object({ content: t.Optional(t.String({ maxLength: 2000, pattern: "^[^\\u0000]*$" })), x: t.Optional(coordSchema()), y: t.Optional(coordSchema()), isPublic: t.Optional(t.Boolean()) }), response: { 200: noteSchema, 403: MessageSchema, 404: MessageSchema }, detail: { summary: "メモ更新(作成者のみ)" } })
  .delete("/api/product/:productId/note/:noteId", async ({ params, user, authorize, status }) => {
    const membership = await getMembership(params.productId, user.userId);
    if (!membership) return status(404, notFound);
    const note = await findNote(params.noteId);
    if (!note || note.productId !== params.productId || !isVisible(note, user.userId)) return status(404, notFound);
    // 削除できるのは作成者だけ(作成者が NULL のメモは、リーダーだけ)
    if (!authorize({ userId: user.userId, role: membership.role }).canEdit(note)) return status(403, forbiddenDelete);
    await db.delete(productNotes).where(eq(productNotes.noteId, params.noteId));
    return status(204, undefined);
  }, { requireUser: true, params: noteParams, response: { 204: t.Void(), 403: MessageSchema, 404: MessageSchema }, detail: { summary: "メモ削除(作成者のみ)" } });
