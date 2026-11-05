import { and, asc, eq, isNull, or } from "drizzle-orm";
import { Elysia, t } from "elysia";
import { db } from "../db";
import { productNotes, users } from "../db/schema";
import { authGuard } from "../lib/auth-guard";
import { getMembership } from "../lib/product-access";
import { MessageSchema } from "../lib/response-schema";
import { coordSchema } from "../lib/section-input";

const params = t.Object({ productId: t.String({ format: "uuid" }) });
const noteParams = t.Object({ productId: t.String({ format: "uuid" }), noteId: t.String({ format: "uuid" }) });
const noteSchema = t.Object({
  noteId: t.String(), productId: t.String(), content: t.String(), x: t.Number(), y: t.Number(),
  authorName: t.Union([t.String(), t.Null()]), createdBy: t.Union([t.String(), t.Null()]), isPublic: t.Boolean(),
  createdAt: t.Date(), updatedAt: t.Date(),
});
const noteListSchema = t.Array(noteSchema);
const notFound = { message: "プロダクトまたはメモが見つかりません" };
const forbiddenEdit = { message: "他の人のメモは変更できません" };
const forbiddenDelete = { message: "メモを削除できるのは、作成者とプロダクトのリーダーだけです" };

// 返す列。作成者の名前は users と LEFT JOIN で引く(作成者が NULL = 退会した人・列を足す前のメモは null)
const noteColumns = {
  noteId: productNotes.noteId, productId: productNotes.productId, content: productNotes.content, x: productNotes.x, y: productNotes.y,
  authorName: users.userName, createdBy: productNotes.createdBy, isPublic: productNotes.isPublic,
  createdAt: productNotes.createdAt, updatedAt: productNotes.updatedAt,
};

/**
 * 見えるメモの条件: 公開、自分が作成者、作成者が NULL(誰にも見えなくならないよう全員に見せる)。
 * 他人の非公開メモは含まない。product-revision.ts も同じ条件を使う
 */
export function visibleNoteFilter(userId: string) {
  return or(eq(productNotes.isPublic, true), eq(productNotes.createdBy, userId), isNull(productNotes.createdBy));
}

type NoteRow = { isPublic: boolean; createdBy: string | null };
const isVisible = (note: NoteRow, userId: string) => note.isPublic || note.createdBy === null || note.createdBy === userId;

async function findNote(noteId: string) {
  const [note] = await db.select(noteColumns).from(productNotes).leftJoin(users, eq(productNotes.createdBy, users.userId)).where(eq(productNotes.noteId, noteId));
  return note;
}

export const productNoteRoutes = new Elysia({ name: "product-note" }).use(authGuard)
  .get("/api/product/:productId/note", async ({ params, user, status }) => {
    if (!await getMembership(params.productId, user.userId)) return status(404, { message: "プロダクトが見つかりません" });
    return db.select(noteColumns).from(productNotes).leftJoin(users, eq(productNotes.createdBy, users.userId))
      .where(and(eq(productNotes.productId, params.productId), visibleNoteFilter(user.userId)))
      .orderBy(asc(productNotes.createdAt), asc(productNotes.noteId));
  }, { requireUser: true, params, response: { 200: noteListSchema, 404: MessageSchema }, detail: { summary: "メモ一覧取得(公開と自分のメモ)" } })
  .post("/api/product/:productId/note", async ({ params, body, user, status }) => {
    if (!await getMembership(params.productId, user.userId)) return status(404, { message: "プロダクトが見つかりません" });
    // isPublic は DB の既定(非公開)のまま。公開は PATCH で作成者が切り替える
    const [created] = await db.insert(productNotes).values({ productId: params.productId, createdBy: user.userId, x: body.x, y: body.y }).returning({ noteId: productNotes.noteId });
    return status(201, (await findNote(created.noteId))!);
  }, { requireUser: true, params, body: t.Object({ x: coordSchema(), y: coordSchema() }), response: { 201: noteSchema, 404: MessageSchema }, detail: { summary: "メモ作成" } })
  .patch("/api/product/:productId/note/:noteId", async ({ params, body, user, status }) => {
    if (!await getMembership(params.productId, user.userId)) return status(404, notFound);
    const note = await findNote(params.noteId);
    // 他人の非公開メモは存在を漏らさないよう、無いのと同じ 404 にする
    if (!note || note.productId !== params.productId || !isVisible(note, user.userId)) return status(404, notFound);
    // 変更できるのは作成者だけ(作成者が NULL のメモは守る人がいないので、メンバー全員)
    if (note.createdBy !== null && note.createdBy !== user.userId) return status(403, forbiddenEdit);
    await db.update(productNotes).set({ ...body, updatedAt: new Date() }).where(eq(productNotes.noteId, params.noteId));
    return (await findNote(params.noteId)) ?? status(404, notFound);
  }, { requireUser: true, params: noteParams, body: t.Object({ content: t.Optional(t.String({ maxLength: 2000, pattern: "^[^\\u0000]*$" })), x: t.Optional(coordSchema()), y: t.Optional(coordSchema()), isPublic: t.Optional(t.Boolean()) }), response: { 200: noteSchema, 403: MessageSchema, 404: MessageSchema }, detail: { summary: "メモ更新(作成者のみ)" } })
  .delete("/api/product/:productId/note/:noteId", async ({ params, user, status }) => {
    const membership = await getMembership(params.productId, user.userId);
    if (!membership) return status(404, notFound);
    const note = await findNote(params.noteId);
    if (!note || note.productId !== params.productId || !isVisible(note, user.userId)) return status(404, notFound);
    // 削除できるのは作成者とリーダー(作成者が NULL のメモは、メンバー全員)
    if (note.createdBy !== null && note.createdBy !== user.userId && membership.role !== "leader") return status(403, forbiddenDelete);
    await db.delete(productNotes).where(eq(productNotes.noteId, params.noteId));
    return status(204, undefined);
  }, { requireUser: true, params: noteParams, response: { 204: t.Void(), 403: MessageSchema, 404: MessageSchema }, detail: { summary: "メモ削除(作成者とリーダー)" } });
