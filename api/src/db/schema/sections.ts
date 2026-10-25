import { sql } from "drizzle-orm";
import { snakeCase, check, doublePrecision, text, timestamp, unique, uuid } from "drizzle-orm/pg-core";
import { sectionColors, type SectionColor } from "../../lib/section";
import { products } from "./products";

// セクション(F1)。プロダクトごとに持ち、メンバーは product_members.section_id で所属する。
// 画面の設計(ユーザー決定): ツールバーの「セクション」から、キャンバスにセクションを置き、大きさを自分で決める。
// そのため、位置と大きさ(キャンバスの座標)を保存する。既定の大きさは、Figma の section-* と同じ 300×400。
export const sections = snakeCase.table(
  "sections",
  {
    sectionId: uuid().primaryKey().defaultRandom(),
    productId: uuid()
      .notNull()
      .references(() => products.productId, { onDelete: "cascade" }),
    sectionName: text().notNull(),
    color: text().notNull().$type<SectionColor>(), // red | yellow | green | purple | lightblue | blue
    // キャンバスの座標(左上)と大きさ。単位はキャンバスのピクセル
    x: doublePrecision().notNull().default(0),
    y: doublePrecision().notNull().default(0),
    width: doublePrecision().notNull().default(300),
    height: doublePrecision().notNull().default(400),
    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    // 同じプロダクトの中で、名前は重複しない(この一意制約が product_id の検索の索引も兼ねる)
    unique("sections_product_name_unique").on(table.productId, table.sectionName),
    check(
      "sections_color_check",
      // 値の一覧は lib/section.ts の sectionColors から作る(tasks_status_check と同じ書き方)
      sql`${table.color} IN (${sql.raw(sectionColors.map((c) => `'${c}'`).join(","))})`,
    ),
    // 大きさは 0 より大きい
    check("sections_size_check", sql`${table.width} > 0 AND ${table.height} > 0`),
    // NaN と ±Infinity は座標にならない(NaN は Postgres では「どの数より大きい」ので、> 0 だけでは通ってしまう)
    check(
      "sections_geometry_finite_check",
      sql`${table.x} > '-Infinity' AND ${table.x} < 'Infinity'
        AND ${table.y} > '-Infinity' AND ${table.y} < 'Infinity'
        AND ${table.width} < 'Infinity' AND ${table.height} < 'Infinity'`,
    ),
  ],
);
