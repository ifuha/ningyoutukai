import { snakeCase, index, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { invitationStatusEnum, inviteeTypeEnum } from "./enums";
import { products } from "./products";
import { users } from "./users";
 
// 全テーブル uuid
export const productInvitations = snakeCase.table(
  "product_invitations",
  {
    invitationId: uuid().primaryKey().defaultRandom(),
    // 招待された側のユーザー。未登録の相手を招待する場合に備えて nullable
    userId: uuid().references(() => users.userId, { onDelete: "cascade" }),
    productId: uuid()
      .notNull()
      .references(() => products.productId, { onDelete: "cascade" }),
    inviteeIdentifier: text().notNull(), // GitHubのusername または Gmail
    inviteeType: inviteeTypeEnum().notNull(),
    status: invitationStatusEnum().notNull().default("pending"),
    respondedAt: timestamp({ withTimezone: true }), // 許可・拒否した日時
    createdAt: timestamp({ withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [index("product_invitations_user_status_idx").on(t.userId, t.status)]
);