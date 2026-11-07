import { eq } from "drizzle-orm";
import { Elysia, t } from "elysia";
import { db } from "../db";
import { products } from "../db/schema";
import { authGuard } from "../lib/auth-guard";
import { AVATAR_MAX_BYTES, detectAvatarImageType, withAvatarUrl } from "../lib/avatar";
import { getMembership } from "../lib/product-access";
import { MessageSchema, ProductSchema } from "../lib/response-schema";
import { objectStorage } from "../lib/storage-plugin";
import type { ObjectStorage } from "../lib/storage";

// キーが変わるので(差し替えるたびに新しいキー)、永久にキャッシュしてよい
const CACHE_CONTROL = "public, max-age=31536000, immutable";

/** R2 から消す。消せなくても、リクエストは成功させる(残った画像は、あとで掃除できる) */
async function deleteQuietly(storage: ObjectStorage, key: string) {
  try {
    await storage.delete(key);
  } catch (e) {
    console.warn(`[product-avatar] ストレージの画像を消せませんでした: ${key}`, e);
  }
}

export const productAvatarRoutes = new Elysia({ name: "product-avatar" })
  .use(authGuard)
  .use(objectStorage)
  // アイコンのアップロード(リーダーのみ): 初めての設定も、あとからの変更も、このルートで行う。
  // 所属していないプロダクトは存在を漏らさないよう 404
  .put(
    "/api/product/:productId/avatar",
    async ({ params, body, user, storage, status }) => {
      const membership = await getMembership(params.productId, user.userId);
      if (!membership) return status(404, { message: "プロダクトが見つかりません" });
      if (membership.role !== "leader") {
        return status(403, { message: "プロダクトリーダーのみ実行できます" });
      }

      // 大きさは、送られた値ではなく、読み込んだ実際のバイト数で確認する
      const bytes = new Uint8Array(await body.file.arrayBuffer());
      if (bytes.byteLength === 0) return status(422, { message: "ファイルが空です" });
      if (bytes.byteLength > AVATAR_MAX_BYTES) {
        return status(413, { message: "画像は 1MB 以下にしてください" });
      }
      // 種類は、送られた Content-Type ではなく、先頭のバイト列で決める
      const type = detectAvatarImageType(bytes);
      if (!type) {
        return status(415, { message: "画像は GIF・PNG・JPEG・WebP のいずれかにしてください" });
      }

      // (1) 新しい画像を保存する(差し替えるたびに新しいキー)
      const newKey = `product-avatars/${params.productId}/${crypto.randomUUID()}.${type.extension}`;
      try {
        await storage.put(newKey, bytes, { contentType: type.contentType, cacheControl: CACHE_CONTROL });
      } catch (e) {
        console.error("[product-avatar] 画像を保存できませんでした", e);
        return status(500, { message: "画像を保存できませんでした" });
      }

      // (2) DB の avatarKey を更新する。古いキーは、同じトランザクションで行を固定して読む(同時の差し替えで取りこぼさない)
      let result: { oldKey: string | null; updated: typeof products.$inferSelect } | undefined;
      try {
        result = await db.transaction(async (tx) => {
          const [current] = await tx
            .select({ avatarKey: products.avatarKey })
            .from(products)
            .where(eq(products.productId, params.productId))
            .for("update");
          if (!current) return undefined;
          const [updated] = await tx
            .update(products)
            .set({ avatarKey: newKey })
            .where(eq(products.productId, params.productId))
            .returning();
          return { oldKey: current.avatarKey, updated };
        });
      } catch (e) {
        // DB に反映できなかったので、保存した新しい画像を消してから、エラーを返す
        console.error("[product-avatar] avatarKey を更新できませんでした", e);
        await deleteQuietly(storage, newKey);
        return status(500, { message: "アイコンを更新できませんでした" });
      }
      if (!result) {
        await deleteQuietly(storage, newKey);
        return status(404, { message: "プロダクトが見つかりません" });
      }

      // (3) 古い画像を消す(消せなくても成功させる)
      if (result.oldKey && result.oldKey !== newKey) await deleteQuietly(storage, result.oldKey);

      return status(200, { ...withAvatarUrl(result.updated), role: membership.role });
    },
    {
      requireUser: true,
      params: t.Object({ productId: t.String({ format: "uuid" }) }),
      // 大きさの上限は、ハンドラで 413 にする(権限の確認より先に、検証で 422 にならないように)
      body: t.Object({ file: t.File() }),
      response: { 200: ProductSchema, 403: MessageSchema, 404: MessageSchema, 413: MessageSchema, 415: MessageSchema, 422: MessageSchema, 500: MessageSchema },
      detail: { summary: "プロダクトのアイコンを設定・変更(リーダー)" },
    }
  )
  // アイコンの削除(リーダーのみ): アイコンがなくても 200(何度呼んでも同じ)
  .delete(
    "/api/product/:productId/avatar",
    async ({ params, user, storage, status }) => {
      const membership = await getMembership(params.productId, user.userId);
      if (!membership) return status(404, { message: "プロダクトが見つかりません" });
      if (membership.role !== "leader") {
        return status(403, { message: "プロダクトリーダーのみ実行できます" });
      }

      // DB を NULL にしてから、R2 を消す。古いキーは、更新と同じトランザクションで固定して読む
      const result = await db.transaction(async (tx) => {
        const [current] = await tx
          .select({ avatarKey: products.avatarKey })
          .from(products)
          .where(eq(products.productId, params.productId))
          .for("update");
        if (!current) return undefined;
        const [updated] = await tx
          .update(products)
          .set({ avatarKey: null })
          .where(eq(products.productId, params.productId))
          .returning();
        return { oldKey: current.avatarKey, updated };
      });
      if (!result) return status(404, { message: "プロダクトが見つかりません" });

      if (result.oldKey) await deleteQuietly(storage, result.oldKey);

      return status(200, { ...withAvatarUrl(result.updated), role: membership.role });
    },
    {
      requireUser: true,
      params: t.Object({ productId: t.String({ format: "uuid" }) }),
      response: { 200: ProductSchema, 403: MessageSchema, 404: MessageSchema },
      detail: { summary: "プロダクトのアイコンを削除(リーダー)" },
    }
  );
