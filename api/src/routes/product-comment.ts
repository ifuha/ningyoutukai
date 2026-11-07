import { asc, eq } from "drizzle-orm";
import { Elysia, t } from "elysia";
import { db } from "../db";
import { productComments, products, users } from "../db/schema";
import { webOrigin } from "../auth";
import { authGuard } from "../lib/auth-guard";
import { commentAuthorizer } from "../lib/comment-authorize";
import { mailer } from "../lib/mailer";
import { getMemberRoleContacts, getMembership } from "../lib/product-access";
import { MessageSchema } from "../lib/response-schema";
import { coordSchema } from "../lib/section-input";

const params = t.Object({ productId: t.String({ format: "uuid" }) });
const commentParams = t.Object({ productId: t.String({ format: "uuid" }), commentId: t.Numeric({ minimum: 1 }) });
const contentSchema = t.String({ minLength: 1, maxLength: 2000, pattern: "^[^\\u0000]*$" });
const commentSchema = t.Object({
  commentId: t.Number(), productId: t.String(), content: t.String(), x: t.Number(), y: t.Number(),
  authorName: t.Union([t.String(), t.Null()]), authorAvatarUrl: t.Union([t.String(), t.Null()]), createdBy: t.Union([t.String(), t.Null()]),
  // 見ている人が、編集・削除できるか(リーダーだけ。画面が、操作を出し分けるのに使う)
  canEdit: t.Boolean(),
  createdAt: t.Date(), updatedAt: t.Date(),
});
const notFound = { message: "プロダクトまたはコメントが見つかりません" };
const forbidden = { message: "コメントを作成・編集・削除できるのはリーダーだけです" };

// 返す列。作成者の名前とアバターは users と LEFT JOIN で引く(作成者が NULL = 退会した人は、どちらも null)
const commentColumns = {
  commentId: productComments.commentId, productId: productComments.productId, content: productComments.content,
  x: productComments.x, y: productComments.y, authorName: users.userName, authorAvatarUrl: users.avatarUrl, createdBy: productComments.createdBy,
  createdAt: productComments.createdAt, updatedAt: productComments.updatedAt,
};

async function findComment(commentId: number) {
  const [comment] = await db.select(commentColumns).from(productComments).leftJoin(users, eq(productComments.createdBy, users.userId)).where(eq(productComments.commentId, commentId));
  return comment;
}

/** メール本文に載せるコメントの内容の長さ(これを超えたら省略する。メモの公開メールと同じ) */
const MAIL_PREVIEW_LENGTH = 200;

/**
 * コメントを作ったとき、メンバー権限の人へメールで知らせる(リーダーには送らない)。
 * mailer.send は失敗しても例外を投げない(失敗は mailer が console.error に出す)ので、コメントの作成は成功させる
 */
async function notifyCommentCreated(args: { productId: string; authorName: string; content: string }) {
  const recipients = await getMemberRoleContacts(args.productId);
  if (recipients.length === 0) return;
  const [product] = await db.select({ productName: products.productName }).from(products).where(eq(products.productId, args.productId));
  const productName = product?.productName ?? "プロダクト";
  const preview = args.content.length > MAIL_PREVIEW_LENGTH ? `${args.content.slice(0, MAIL_PREVIEW_LENGTH)}…` : args.content;
  const lines = [`${args.authorName} さんが、プロダクト「${productName}」にコメントしました。`, "", preview, "", "プロダクトを開く:", `${webOrigin}/products/${args.productId}`];
  await mailer.send({ to: recipients.map((r) => r.email), subject: `コメントが追加されました: ${productName}`, text: lines.join("\n") });
}

export const productCommentRoutes = new Elysia({ name: "product-comment" }).use(authGuard).use(commentAuthorizer)
  .get("/api/product/:productId/comment", async ({ params, user, commentAuthorize, status }) => {
    // 見られるのは、プロダクトの参加者全員(権限は問わない)
    const membership = await getMembership(params.productId, user.userId);
    if (!membership) return status(404, { message: "プロダクトが見つかりません" });
    const rows = await db.select(commentColumns).from(productComments).leftJoin(users, eq(productComments.createdBy, users.userId))
      .where(eq(productComments.productId, params.productId))
      .orderBy(asc(productComments.createdAt), asc(productComments.commentId));
    const canEdit = commentAuthorize({ userId: user.userId, role: membership.role }).canWrite();
    return rows.map((c) => ({ ...c, canEdit }));
  }, { requireUser: true, params, response: { 200: t.Array(commentSchema), 404: MessageSchema }, detail: { summary: "コメント一覧取得(参加者全員)" } })
  .post("/api/product/:productId/comment", async ({ params, body, user, commentAuthorize, status }) => {
    const membership = await getMembership(params.productId, user.userId);
    if (!membership) return status(404, { message: "プロダクトが見つかりません" });
    if (!commentAuthorize({ userId: user.userId, role: membership.role }).canWrite()) return status(403, forbidden);
    const [created] = await db.insert(productComments).values({ productId: params.productId, createdBy: user.userId, content: body.content, x: body.x, y: body.y }).returning({ commentId: productComments.commentId });
    const comment = (await findComment(created.commentId))!;
    await notifyCommentCreated({ productId: params.productId, authorName: user.userName, content: body.content });
    return status(201, { ...comment, canEdit: true });
  }, { requireUser: true, params, body: t.Object({ content: contentSchema, x: coordSchema(), y: coordSchema() }), response: { 201: commentSchema, 403: MessageSchema, 404: MessageSchema }, detail: { summary: "コメント作成(リーダーのみ。メンバー権限の人にメールで知らせる)" } })
  .patch("/api/product/:productId/comment/:commentId", async ({ params, body, user, commentAuthorize, status }) => {
    const membership = await getMembership(params.productId, user.userId);
    if (!membership) return status(404, notFound);
    if (!commentAuthorize({ userId: user.userId, role: membership.role }).canWrite()) return status(403, forbidden);
    const comment = await findComment(params.commentId);
    if (!comment || comment.productId !== params.productId) return status(404, notFound);
    await db.update(productComments).set({ ...body, updatedAt: new Date() }).where(eq(productComments.commentId, params.commentId));
    const updated = await findComment(params.commentId);
    return updated ? { ...updated, canEdit: true } : status(404, notFound);
  }, { requireUser: true, params: commentParams, body: t.Object({ content: t.Optional(contentSchema), x: t.Optional(coordSchema()), y: t.Optional(coordSchema()) }), response: { 200: commentSchema, 403: MessageSchema, 404: MessageSchema }, detail: { summary: "コメント更新(リーダーのみ)" } })
  .delete("/api/product/:productId/comment/:commentId", async ({ params, user, commentAuthorize, status }) => {
    const membership = await getMembership(params.productId, user.userId);
    if (!membership) return status(404, notFound);
    if (!commentAuthorize({ userId: user.userId, role: membership.role }).canWrite()) return status(403, forbidden);
    const comment = await findComment(params.commentId);
    if (!comment || comment.productId !== params.productId) return status(404, notFound);
    await db.delete(productComments).where(eq(productComments.commentId, params.commentId));
    return status(204, undefined);
  }, { requireUser: true, params: commentParams, response: { 204: t.Void(), 403: MessageSchema, 404: MessageSchema }, detail: { summary: "コメント削除(リーダーのみ)" } });
