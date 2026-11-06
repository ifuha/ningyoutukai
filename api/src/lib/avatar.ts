/**
 * プロダクトのアイコン(`products.avatarKey` = R2 のキー)を、画面に渡す URL にする変換。
 * 画面には、キーそのものは渡さない。`avatarUrl` だけを渡す。変換は、この 1 か所にまとめる。
 */

/** ローカル開発用の配信ルート(`GET /api/_dev-storage/*`)のパス。`AVATAR_BASE_URL` が未設定のときだけ登録される(`app.ts`) */
export const DEV_STORAGE_PATH = "/api/_dev-storage";

/** 公開 URL の根。環境変数 `AVATAR_BASE_URL`(Workers では `vars`)。未設定(空)なら undefined。末尾の `/` は取り除く */
export function avatarBaseUrl(): string | undefined {
  const base = process.env.AVATAR_BASE_URL?.trim().replace(/\/+$/, "");
  return base ? base : undefined;
}

/**
 * アイコンのキーを URL にする。キーがなければ null。
 * - `AVATAR_BASE_URL` があれば、`<AVATAR_BASE_URL>/<キー>`(R2 の公開 URL。`<img>` が直接読む)
 * - なければ(ローカルとテスト)、`/api/_dev-storage/<キー>`(開発用の配信ルート)
 */
export function avatarUrlOf(key: string | null | undefined): string | null {
  if (!key) return null;
  return `${avatarBaseUrl() ?? DEV_STORAGE_PATH}/${key}`;
}

/** プロダクトの行(`avatarKey` を含む)から、応答用の形にする。`avatarKey` は外し、`avatarUrl` を足す */
export function withAvatarUrl<T extends { avatarKey: string | null }>(row: T): Omit<T, "avatarKey"> & { avatarUrl: string | null } {
  const { avatarKey, ...rest } = row;
  return { ...rest, avatarUrl: avatarUrlOf(avatarKey) };
}
