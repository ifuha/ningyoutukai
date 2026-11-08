import { t } from "elysia";

/**
 * 複数のルートで共通の応答の形。
 * スキーマを 1 か所で書き、型(`Static`)・応答の検証・Swagger の表示のすべてに使う。
 */

// エラー応答の本文
export const MessageSchema = t.Object({ message: t.String() });

// プロダクト(日時は、DB の Date のまま返す。JSON になると ISO 文字列になる)
export const ProductSchema = t.Object({
  productId: t.String(),
  productName: t.String(),
  createdAt: t.Date(),
  // アイコンの URL(なければ null)。R2 のキー(avatarKey)は出さない
  avatarUrl: t.Union([t.String(), t.Null()]),
  // 文書(Markdown)の自動削除までの日数(最後に呼び出されてから。初期 7 日)。プロダクト設定の画面が表示する
  documentAutoDeleteDays: t.Number(),
  role: t.Union([t.Literal("leader"), t.Literal("member")]),
});
