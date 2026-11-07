import { eq } from "drizzle-orm";
import { Elysia, t } from "elysia";
import { db } from "../db";
import { products } from "../db/schema";
import { authGuard } from "../lib/auth-guard";
import { withAvatarUrl } from "../lib/avatar";
import { getMembership } from "../lib/product-access";
import { MessageSchema, ProductSchema } from "../lib/response-schema";
import { objectStorage } from "../lib/storage-plugin";
import { NO_NUL } from "../lib/validation";

export const productManageRoutes = new Elysia({ name: "product-manage" })
  .use(authGuard)
  .use(objectStorage)
  // プロダクト情報変更(リーダーのみ): 所属していないプロダクトは存在を漏らさないよう 404
  .patch(
    "/api/product/:productId",
    async ({ params, body, user, status }) => {
      const membership = await getMembership(params.productId, user.userId);
      if (!membership) return status(404, { message: "プロダクトが見つかりません" });
      if (membership.role !== "leader") {
        return status(403, { message: "プロダクトリーダーのみ実行できます" });
      }

      const productName = body.productName.trim();
      if (!productName) return status(400, { message: "プロダクト名を入力してください" });

      const [updated] = await db
        .update(products)
        .set({ productName })
        .where(eq(products.productId, params.productId))
        .returning();
      if (!updated) return status(404, { message: "プロダクトが見つかりません" });

      // avatarKey(R2 のキー)は応答に含めない。代わりに avatarUrl を返す
      return status(200, { ...withAvatarUrl(updated), role: membership.role });
    },
    {
      requireUser: true,
      params: t.Object({ productId: t.String({ format: "uuid" }) }),
      // NUL 文字は PostgreSQL が拒否して 500 になるため、pattern で弾いて 422 にする
      body: t.Object({ productName: t.String({ maxLength: 100, pattern: NO_NUL }) }),
      response: { 200: ProductSchema, 400: MessageSchema, 403: MessageSchema, 404: MessageSchema },
      detail: { summary: "プロダクト情報変更(リーダー)" },
    }
  )
  // プロダクト削除(リーダーのみ): メンバー・招待・タスク種類・タスクは外部キーの cascade で一緒に消える
  .delete(
    "/api/product/:productId",
    async ({ params, user, storage, status }) => {
      const membership = await getMembership(params.productId, user.userId);
      if (!membership) return status(404, { message: "プロダクトが見つかりません" });
      if (membership.role !== "leader") {
        return status(403, { message: "プロダクトリーダーのみ実行できます" });
      }

      // 行が消えると avatarKey が読めなくなるので、削除の前に読んでおく
      const [before] = await db
        .select({ avatarKey: products.avatarKey })
        .from(products)
        .where(eq(products.productId, params.productId));

      const deleted = await db
        .delete(products)
        .where(eq(products.productId, params.productId))
        .returning({ productId: products.productId });
      if (deleted.length === 0) return status(404, { message: "プロダクトが見つかりません" });

      // DB の削除が成功したあとで、R2 のアイコンも消す(消せなくても、削除は成功させる)
      if (before?.avatarKey) {
        try {
          await storage.delete(before.avatarKey);
        } catch (e) {
          console.warn(`[product-manage] アイコンの画像を消せませんでした: ${before.avatarKey}`, e);
        }
      }

      return status(204, undefined);
    },
    {
      requireUser: true,
      params: t.Object({ productId: t.String({ format: "uuid" }) }),
      response: { 204: t.Undefined(), 403: MessageSchema, 404: MessageSchema },
      detail: { summary: "プロダクト削除(リーダー)" },
    }
  );
