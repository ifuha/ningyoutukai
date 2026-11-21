import { asc, inArray } from "drizzle-orm";
import { t } from "elysia";
import type { db } from "../db";
import { productMembers, sections } from "../db/schema";
import type { sectionColors } from "./section";
import { sectionColorSchema } from "./section-input";

/** セクション API が返すセクションの形(一覧・作成・更新で共通) */
export const SectionSchema = t.Object({
  sectionId: t.String(),
  sectionName: t.String(),
  color: sectionColorSchema(),
  x: t.Number(),
  y: t.Number(),
  width: t.Number(),
  height: t.Number(),
  createdAt: t.Date(),
  // 所属するメンバー(productMemberId)。並びは productMemberId の昇順で固定する
  memberIds: t.Array(t.String()),
});

export const sectionColumns = {
  sectionId: sections.sectionId,
  sectionName: sections.sectionName,
  color: sections.color,
  x: sections.x,
  y: sections.y,
  width: sections.width,
  height: sections.height,
  createdAt: sections.createdAt,
};

export type SectionRow = {
  sectionId: string;
  sectionName: string;
  color: (typeof sectionColors)[number];
  x: number;
  y: number;
  width: number;
  height: number;
  createdAt: Date;
};

// トランザクション(tx)でも、通常の db でも、同じ関数で使えるようにする
type Executor = Pick<typeof db, "select">;

/** セクションごとの所属メンバーの一覧を、セクション ID をキーにして返す */
export async function loadMemberIds(executor: Executor, sectionIds: string[]) {
  const byId = new Map<string, string[]>();
  if (sectionIds.length === 0) return byId;
  const rows = await executor
    .select({ sectionId: productMembers.sectionId, productMemberId: productMembers.productMemberId })
    .from(productMembers)
    .where(inArray(productMembers.sectionId, sectionIds))
    .orderBy(asc(productMembers.productMemberId));
  for (const row of rows) {
    if (!row.sectionId) continue;
    const list = byId.get(row.sectionId);
    if (list) list.push(row.productMemberId);
    else byId.set(row.sectionId, [row.productMemberId]);
  }
  return byId;
}

/** セクションの行に、所属メンバーを足して、応答の形にする */
export async function withMemberIds(executor: Executor, rows: SectionRow[]) {
  const memberIds = await loadMemberIds(
    executor,
    rows.map((r) => r.sectionId),
  );
  return rows.map((r) => ({ ...r, memberIds: memberIds.get(r.sectionId) ?? [] }));
}
