import { snakeCase, unique, uuid } from "drizzle-orm/pg-core";
import { memberRoleEnum } from "./enums";
import { products } from "./products";
import { users } from "./users";

export const productMembers = snakeCase.table(
  "product_members",
  {
    productMemberId: uuid().primaryKey().defaultRandom(),
    productId: uuid()
      .notNull()
      .references(() => products.productId, { onDelete: "cascade" }),
    userId: uuid()
      .notNull()
      .references(() => users.userId, { onDelete: "cascade" }),
    role: memberRoleEnum().notNull().default("member"),
  },
  // 同じユーザーが同じプロダクトに二重参加しない
  (t) => [unique().on(t.productId, t.userId)]
);
