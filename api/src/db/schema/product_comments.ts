import { doublePrecision, index, integer, snakeCase, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { products } from "./products";
import { users } from "./users";

// コメント: リーダーが画面(ツリー)の座標に置き、メンバーに知らせるときに使う。見られるのはプロダクトの参加者全員
export const productComments = snakeCase.table("product_comments", {
  commentId: integer().primaryKey().generatedAlwaysAsIdentity(),
  productId: uuid().notNull().references(() => products.productId, { onDelete: "cascade" }),
  // コメントの作成者。退会(ユーザー削除)してもコメントは残し、作成者だけ NULL に戻す(メモと同じ)
  createdBy: uuid().references(() => users.userId, { onDelete: "set null" }),
  content: text().notNull().default(""),
  x: doublePrecision().notNull().default(0),
  y: doublePrecision().notNull().default(0),
  createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  // 一覧はプロダクトごとに取る。ユーザーを消したときの SET NULL も全件走査にしない
  index("product_comments_product_id_idx").on(table.productId),
  index("product_comments_created_by_idx").on(table.createdBy),
]);
