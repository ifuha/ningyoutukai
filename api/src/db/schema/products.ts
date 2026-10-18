import { pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";

export const products = pgTable("products", {
  productId: uuid().primaryKey().defaultRandom(),
  productName: text().notNull(),
  createdAt: timestamp({ withTimezone: true }).defaultNow().notNull(),
});
