import { uuid, pgTable, text, timestamp } from "drizzle-orm/pg-core";

export const tasks = pgTable("tasks", {
  productId: uuid().primaryKey().defaultRandom(),
  productName: text().notNull(),
  created_at: timestamp().defaultNow().notNull(),
});