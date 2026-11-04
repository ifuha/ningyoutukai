import { sql } from "drizzle-orm";
import { check, doublePrecision, snakeCase, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { products } from "./products";

export const productNotes = snakeCase.table("product_notes", {
  noteId: uuid().primaryKey().defaultRandom(),
  productId: uuid().notNull().references(() => products.productId, { onDelete: "cascade" }),
  content: text().notNull().default(""),
  x: doublePrecision().notNull().default(0),
  y: doublePrecision().notNull().default(0),
  createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  check("product_notes_content_length_check", sql`char_length(${table.content}) <= 2000`),
  check("product_notes_geometry_finite_check", sql`${table.x} > '-Infinity' AND ${table.x} < 'Infinity' AND ${table.y} > '-Infinity' AND ${table.y} < 'Infinity'`),
]);
