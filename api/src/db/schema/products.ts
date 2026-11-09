import { sql } from "drizzle-orm";
import { check, integer, snakeCase, text, timestamp, uuid } from "drizzle-orm/pg-core";

export const products = snakeCase.table("products", {
  productId: uuid().primaryKey().defaultRandom(),
  productName: text().notNull(),
  // プロダクトのアイコン(画像)の、R2 のキー(例: product-avatars/<productId>/<ランダム>.png)。URL ではなく、キーを持つ(配信のドメインが変わっても直せる)。NULL = アイコンなし
  avatarKey: text(),
  // 文書(Markdown)の自動削除までの日数(最後に呼び出されてから)。プロダクトの設定(リーダーだけが変える)。初期は 7 日
  documentAutoDeleteDays: integer().notNull().default(7),
  createdAt: timestamp({ withTimezone: true }).defaultNow().notNull(),
}, (table) => [check("products_document_auto_delete_days_check", sql`${table.documentAutoDeleteDays} BETWEEN 1 AND 3650`)]);
