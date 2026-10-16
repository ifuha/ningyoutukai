import { uuid, pgTable, pgEnum, text } from "drizzle-orm/pg-core";
import { products } from "./products";

export const memberRoleEnum = pgEnum("member_role", ["leader","member"]);

export const users = pgTable("users", {
  productMembersId: uuid().primaryKey().defaultRandom(),
  productId: uuid().defaultRandom().notNull().references(() => products.productId, { onDelete: "cascade" }),
  email: text().notNull().unique(),
  role: memberRoleEnum().notNull().default("member"),
});
