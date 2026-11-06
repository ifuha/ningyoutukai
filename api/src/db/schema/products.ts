import { snakeCase, text, timestamp, uuid } from "drizzle-orm/pg-core";

export const products = snakeCase.table("products", {
  productId: uuid().primaryKey().defaultRandom(),
  productName: text().notNull(),
  // プロダクトのアイコン(画像)の、R2 のキー(例: product-avatars/<productId>/<ランダム>.png)。URL ではなく、キーを持つ(配信のドメインが変わっても直せる)。NULL = アイコンなし
  avatarKey: text(),
  createdAt: timestamp({ withTimezone: true }).defaultNow().notNull(),
});
