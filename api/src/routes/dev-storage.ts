import type { Elysia } from "elysia";
import { avatarBaseUrl, DEV_STORAGE_PATH } from "../lib/avatar";
import { assertValidKey, StorageKeyError, storage } from "../lib/storage";

/**
 * ローカル開発(Bun)とテスト用の、保存したファイルの配信ルート `GET /api/_dev-storage/*`。
 * 本番は R2 の公開 URL(`AVATAR_BASE_URL`)から `<img>` が直接読むので、このルートは**登録しない**。
 * `AVATAR_BASE_URL` が未設定のときだけ登録する(`app.ts` の読み込み時に、環境変数を見て決める)。
 * `app.use(devStorageRoutes)` で使うプラグイン関数。
 */
export function devStorageRoutes<T extends Elysia<any, any, any, any, any, any, any>>(app: T): T {
  if (avatarBaseUrl()) return app;
  return app.get(`${DEV_STORAGE_PATH}/*`, async ({ params, set }) => {
    let object;
    try {
      object = await storage.get(assertValidKey(params["*"] ?? ""));
    } catch (e) {
      if (e instanceof StorageKeyError) object = null;
      else throw e;
    }
    if (!object) {
      set.status = 404;
      return { message: "見つかりません" };
    }
    const headers = new Headers();
    if (object.contentType) headers.set("content-type", object.contentType);
    if (object.cacheControl) headers.set("cache-control", object.cacheControl);
    return new Response(object.body, { headers });
  }) as unknown as T;
}
