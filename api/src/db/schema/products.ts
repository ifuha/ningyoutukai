import { uuid, pgTable, text, timestamp } from "drizzle-orm/pg-core";

export const products = pgTable("products", {
  productId: uuid().primaryKey().defaultRandom(),
  productName: text().notNull(),
  created_at: timestamp().defaultNow().notNull(),
});