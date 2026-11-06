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

/** アイコンの大きさの上限(1MB) */
export const AVATAR_MAX_BYTES = 1_048_576;

/** アイコンに使える画像の種類。SVG は使えない(スクリプトを含められるため) */
export type AvatarImageType = {
  contentType: "image/png" | "image/jpeg" | "image/gif" | "image/webp";
  extension: "png" | "jpg" | "gif" | "webp";
};

const startsWith = (bytes: Uint8Array, head: number[], offset = 0) =>
  bytes.length >= offset + head.length && head.every((b, i) => bytes[offset + i] === b);

/**
 * ファイルの先頭のバイト列(マジックナンバー)で、画像の種類を判定する。
 * ブラウザが送る Content-Type は偽装できるので、信用しない。GIF・PNG・JPEG・WebP 以外は null。
 */
export function detectAvatarImageType(bytes: Uint8Array): AvatarImageType | null {
  if (startsWith(bytes, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) return { contentType: "image/png", extension: "png" };
  if (startsWith(bytes, [0xff, 0xd8, 0xff])) return { contentType: "image/jpeg", extension: "jpg" };
  // "GIF87a" / "GIF89a"
  if (startsWith(bytes, [0x47, 0x49, 0x46, 0x38, 0x37, 0x61]) || startsWith(bytes, [0x47, 0x49, 0x46, 0x38, 0x39, 0x61])) {
    return { contentType: "image/gif", extension: "gif" };
  }
  // "RIFF" + (4 バイト) + "WEBP"
  if (startsWith(bytes, [0x52, 0x49, 0x46, 0x46]) && startsWith(bytes, [0x57, 0x45, 0x42, 0x50], 8)) {
    return { contentType: "image/webp", extension: "webp" };
  }
  return null;
}
