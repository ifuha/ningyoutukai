import { sql } from "drizzle-orm";
import { snakeCase, check, doublePrecision, index, unique, uuid } from "drizzle-orm/pg-core";
import { memberRoleEnum } from "./enums";
import { products } from "./products";
import { sections } from "./sections";
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
    // 所属するセクション(明示的な所属。1 人 1 セクション。Q1 は未決定で、案)。無所属は NULL。
    // セクションを消すと、中のメンバーは無所属に戻り、メンバー自体は残る。
    // カードをセクションの中に置くと、API が section_id を決める想定
    sectionId: uuid().references(() => sections.sectionId, { onDelete: "set null" }),
    // カードの自由な位置(キャンバスの絶対座標)。NULL は「まだ自由な位置を持たない = 自動配置」。
    // 片方だけ NULL にはできない(CHECK)。
    // 位置と section_id が食い違わないこと(セクションの中に置いたら section_id が入る)、
    // 同じプロダクトのセクションかどうかは、DB では守らない。API の責任
    positionX: doublePrecision(),
    positionY: doublePrecision(),
  },
  (t) => [
    // 同じユーザーが同じプロダクトに二重参加しない
    unique().on(t.productId, t.userId),
    // セクションを消したときの SET NULL と、セクションごとのメンバー検索を全件走査にしない
    index("product_members_section_idx").on(t.sectionId),
    // 位置は、両方 NULL か、両方 NOT NULL
    check(
      "product_members_position_pair_check",
      sql`(${t.positionX} IS NULL) = (${t.positionY} IS NULL)`,
    ),
    // NaN と ±Infinity は座標にならない(NULL は通る)
    check(
      "product_members_position_finite_check",
      sql`(${t.positionX} IS NULL OR (${t.positionX} > '-Infinity' AND ${t.positionX} < 'Infinity'))
        AND (${t.positionY} IS NULL OR (${t.positionY} > '-Infinity' AND ${t.positionY} < 'Infinity'))`,
    ),
  ]
);
