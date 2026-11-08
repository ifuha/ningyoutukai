import { sql } from "drizzle-orm";
import { check, doublePrecision, primaryKey, snakeCase, uuid } from "drizzle-orm/pg-core";
import { aiTokens } from "./ai_tokens";
import { products } from "./products";

// ツリーの AI のカードの位置(プロダクトごと)。仕様は docs/v4.0/overview.md
// - 持ち主のカードに付いて動く。ここに持つのは、**初めの置き場所(リーダーは右、メンバーは下)からのずれ**(px)。行がなければ、初めの置き場所
// - 動かせるのはリーダーだけ(メンバーのカードと同じ)。トークンを消すか、プロダクトを消すと、行も消える
export const productAiPositions = snakeCase.table(
  "product_ai_positions",
  {
    productId: uuid()
      .notNull()
      .references(() => products.productId, { onDelete: "cascade" }),
    tokenId: uuid()
      .notNull()
      .references(() => aiTokens.tokenId, { onDelete: "cascade" }),
    offsetX: doublePrecision().notNull(),
    offsetY: doublePrecision().notNull(),
  },
  (t) => [
    primaryKey({ columns: [t.productId, t.tokenId] }),
    // NaN と ±Infinity は座標にならない
    check(
      "product_ai_positions_finite_check",
      sql`${t.offsetX} > '-Infinity' AND ${t.offsetX} < 'Infinity' AND ${t.offsetY} > '-Infinity' AND ${t.offsetY} < 'Infinity'`,
    ),
  ],
);
