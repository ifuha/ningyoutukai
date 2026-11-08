import { Elysia, t } from "elysia";
import { and, eq, gt, isNull } from "drizzle-orm";
import { db } from "../db";
import { aiTokens, productAiPositions, productMembers } from "../db/schema";
import { authGuard } from "../lib/auth-guard";
import { getMembership } from "../lib/product-access";
import { MessageSchema } from "../lib/response-schema";
import { coordSchema } from "../lib/section-input";

// ツリーの AI のカードの位置。仕様は docs/v4.0/overview.md
// - 動かせるのは**リーダーだけ**(メンバーのカードと同じ)。位置は、初めの置き場所(リーダーは右、メンバーは下)からのずれ(px)
// - 対象は、このプロダクトのメンバーが持つ、有効な(取り消されていない・期限内の)トークンだけ。それ以外は 404
// - `DELETE` で、初めの置き場所に戻す
const params = t.Object({ productId: t.String({ format: "uuid" }), tokenId: t.String({ format: "uuid" }) });
const OffsetSchema = t.Object({ offsetX: t.Number(), offsetY: t.Number() });

export const productAiPositionRoutes = new Elysia({ name: "product-ai-position" })
  .use(authGuard)
  .put(
    "/api/product/:productId/ai/:tokenId/position",
    async ({ params, body, user, status }) => {
      const membership = await getMembership(params.productId, user.userId);
      if (!membership) return status(404, { message: "プロダクトが見つかりません" });
      if (membership.role !== "leader") return status(403, { message: "プロダクトリーダーのみ実行できます" });
      if (!(await tokenInProduct(params.productId, params.tokenId))) return status(404, { message: "AI が見つかりません" });
      await db
        .insert(productAiPositions)
        .values({ productId: params.productId, tokenId: params.tokenId, offsetX: body.offsetX, offsetY: body.offsetY })
        .onConflictDoUpdate({ target: [productAiPositions.productId, productAiPositions.tokenId], set: { offsetX: body.offsetX, offsetY: body.offsetY } });
      return { tokenId: params.tokenId, offsetX: body.offsetX, offsetY: body.offsetY };
    },
    {
      requireUser: true,
      params,
      // 座標の範囲は、セクションと同じ
      body: t.Object({ offsetX: coordSchema(), offsetY: coordSchema() }),
      response: { 200: t.Composite([t.Object({ tokenId: t.String() }), OffsetSchema]), 403: MessageSchema, 404: MessageSchema },
      detail: { summary: "AI のカードの位置を変える(リーダーのみ)" },
    },
  )
  .delete(
    "/api/product/:productId/ai/:tokenId/position",
    async ({ params, user, status }) => {
      const membership = await getMembership(params.productId, user.userId);
      if (!membership) return status(404, { message: "プロダクトが見つかりません" });
      if (membership.role !== "leader") return status(403, { message: "プロダクトリーダーのみ実行できます" });
      await db.delete(productAiPositions).where(and(eq(productAiPositions.productId, params.productId), eq(productAiPositions.tokenId, params.tokenId)));
      return { message: "初めの置き場所に戻しました" };
    },
    { requireUser: true, params, response: { 200: MessageSchema, 403: MessageSchema, 404: MessageSchema }, detail: { summary: "AI のカードを初めの置き場所に戻す(リーダーのみ)" } },
  );

/** このプロダクトのメンバーが持つ、有効なトークンか */
async function tokenInProduct(productId: string, tokenId: string): Promise<boolean> {
  const rows = await db
    .select({ tokenId: aiTokens.tokenId })
    .from(aiTokens)
    .innerJoin(productMembers, and(eq(productMembers.userId, aiTokens.userId), eq(productMembers.productId, productId)))
    .where(and(eq(aiTokens.tokenId, tokenId), isNull(aiTokens.revokedAt), gt(aiTokens.expiresAt, new Date())))
    .limit(1);
  return rows.length > 0;
}
