import { sql } from "drizzle-orm";
import { boolean, check, doublePrecision, index, snakeCase, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { products } from "./products";
import { users } from "./users";

export const productNotes = snakeCase.table("product_notes", {
  noteId: uuid().primaryKey().defaultRandom(),
  productId: uuid().notNull().references(() => products.productId, { onDelete: "cascade" }),
  // メモの作成者。退会(ユーザー削除)してもメモは残し、作成者だけ NULL に戻す。既存のメモも NULL
  createdBy: uuid().references(() => users.userId, { onDelete: "set null" }),
  // 公開 = プロダクトのメンバー全員に見える、非公開 = 作成者だけに見える(既定は非公開)
  isPublic: boolean().notNull().default(false),
  content: text().notNull().default(""),
  x: doublePrecision().notNull().default(0),
  y: doublePrecision().notNull().default(0),
  createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  // ユーザーを消したときの SET NULL と、作成者ごとのメモ検索を全件走査にしない
  index("product_notes_created_by_idx").on(table.createdBy),
  check("product_notes_content_length_check", sql`char_length(${table.content}) <= 2000`),
  check("product_notes_geometry_finite_check", sql`${table.x} > '-Infinity' AND ${table.x} < 'Infinity' AND ${table.y} > '-Infinity' AND ${table.y} < 'Infinity'`),
]);
