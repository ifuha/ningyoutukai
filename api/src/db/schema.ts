import { integer, pgTable, text, timestamp } from "drizzle-orm/pg-core";

export const items = pgTable("items", {
  id: integer().primaryKey().generatedAlwaysAsIdentity(),
  name: text().notNull(),
  createdAt: timestamp().defaultNow().notNull(),
});
