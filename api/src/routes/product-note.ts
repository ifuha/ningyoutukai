import { and, asc, eq } from "drizzle-orm";
import { Elysia, t } from "elysia";
import { db } from "../db";
import { productNotes } from "../db/schema";
import { authGuard } from "../lib/auth-guard";
import { getMembership } from "../lib/product-access";
import { MessageSchema } from "../lib/response-schema";
import { coordSchema } from "../lib/section-input";

const params = t.Object({ productId: t.String({ format: "uuid" }) });
const noteParams = t.Object({ productId: t.String({ format: "uuid" }), noteId: t.String({ format: "uuid" }) });
const noteSchema = t.Object({ noteId: t.String(), productId: t.String(), content: t.String(), x: t.Number(), y: t.Number(), createdAt: t.Date(), updatedAt: t.Date() });
const noteListSchema = t.Array(noteSchema);
const notFound = { message: "プロダクトまたはメモが見つかりません" };

export const productNoteRoutes = new Elysia({ name: "product-note" }).use(authGuard)
  .get("/api/product/:productId/note", async ({ params, user, status }) => {
    if (!await getMembership(params.productId, user.userId)) return status(404, { message: "プロダクトが見つかりません" });
    return db.select().from(productNotes).where(eq(productNotes.productId, params.productId)).orderBy(asc(productNotes.createdAt), asc(productNotes.noteId));
  }, { requireUser: true, params, response: { 200: noteListSchema, 404: MessageSchema }, detail: { summary: "メモ一覧取得" } })
  .post("/api/product/:productId/note", async ({ params, body, user, status }) => {
    if (!await getMembership(params.productId, user.userId)) return status(404, { message: "プロダクトが見つかりません" });
    const [note] = await db.insert(productNotes).values({ productId: params.productId, x: body.x, y: body.y }).returning();
    return status(201, note);
  }, { requireUser: true, params, body: t.Object({ x: coordSchema(), y: coordSchema() }), response: { 201: noteSchema, 404: MessageSchema }, detail: { summary: "メモ作成" } })
  .patch("/api/product/:productId/note/:noteId", async ({ params, body, user, status }) => {
    if (!await getMembership(params.productId, user.userId)) return status(404, notFound);
    const patch = { ...body, updatedAt: new Date() };
    const [note] = await db.update(productNotes).set(patch).where(and(eq(productNotes.productId, params.productId), eq(productNotes.noteId, params.noteId))).returning();
    return note ?? status(404, notFound);
  }, { requireUser: true, params: noteParams, body: t.Object({ content: t.Optional(t.String({ maxLength: 2000, pattern: "^[^\\u0000]*$" })), x: t.Optional(coordSchema()), y: t.Optional(coordSchema()) }), response: { 200: noteSchema, 404: MessageSchema }, detail: { summary: "メモ更新" } })
  .delete("/api/product/:productId/note/:noteId", async ({ params, user, status }) => {
    if (!await getMembership(params.productId, user.userId)) return status(404, notFound);
    const [note] = await db.delete(productNotes).where(and(eq(productNotes.productId, params.productId), eq(productNotes.noteId, params.noteId))).returning({ noteId: productNotes.noteId });
    return note ? status(204) : status(404, notFound);
  }, { requireUser: true, params: noteParams, response: { 204: t.Void(), 404: MessageSchema }, detail: { summary: "メモ削除" } });
