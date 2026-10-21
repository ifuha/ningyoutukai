import { snakeCase, uuid, text } from "drizzle-orm/pg-core";

export const users = snakeCase.table("users", {
  userId: uuid().primaryKey().defaultRandom(),
  userName: text().notNull(),
  email: text().notNull().unique(),
  avatarUrl: text(),
  githubId: text().unique(),
  googleSub: text().unique()
});
