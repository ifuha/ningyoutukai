import { afterAll, describe, expect, test } from "bun:test";
import { eq } from "drizzle-orm";
import { db } from "../../src/db";
import { productNotes, sections } from "../../src/db/schema";
import { SOFT_DELETE_TTL_MS, cleanupExpiredDeletions } from "../../src/lib/soft-delete-cleanup";
import { cleanup, setupProduct } from "../task/helpers";

// 期限切れの論理削除(deletedAt が過ぎたセクション・メモ)の物理削除

afterAll(cleanup);

describe("cleanupExpiredDeletions", () => {
  test("10 分経ったセクション・メモは物理削除。期限内と、論理削除されていないものは残る", async () => {
    const { productId } = await setupProduct();
    const name = (i: number) => `s-${crypto.randomUUID().slice(0, 8)}-${i}`;
    const [freshSection] = await db
      .insert(sections)
      .values({ productId, sectionName: name(1), color: "red", deletedAt: new Date(Date.now() - 5 * 60_000) })
      .returning();
    const [staleSection] = await db
      .insert(sections)
      .values({ productId, sectionName: name(2), color: "red", deletedAt: new Date(Date.now() - (SOFT_DELETE_TTL_MS + 30_000)) })
      .returning();
    const [liveSection] = await db
      .insert(sections)
      .values({ productId, sectionName: name(3), color: "red" })
      .returning();
    const [freshNote] = await db
      .insert(productNotes)
      .values({ productId, content: "a", deletedAt: new Date(Date.now() - 5 * 60_000) })
      .returning();
    const [staleNote] = await db
      .insert(productNotes)
      .values({ productId, content: "b", deletedAt: new Date(Date.now() - (SOFT_DELETE_TTL_MS + 30_000)) })
      .returning();
    const [liveNote] = await db
      .insert(productNotes)
      .values({ productId, content: "c" })
      .returning();

    await cleanupExpiredDeletions();

    expect((await db.select().from(sections).where(eq(sections.sectionId, freshSection.sectionId))).length).toBe(1);
    expect((await db.select().from(sections).where(eq(sections.sectionId, staleSection.sectionId))).length).toBe(0);
    expect((await db.select().from(sections).where(eq(sections.sectionId, liveSection.sectionId))).length).toBe(1);
    expect((await db.select().from(productNotes).where(eq(productNotes.noteId, freshNote.noteId))).length).toBe(1);
    expect((await db.select().from(productNotes).where(eq(productNotes.noteId, staleNote.noteId))).length).toBe(0);
    expect((await db.select().from(productNotes).where(eq(productNotes.noteId, liveNote.noteId))).length).toBe(1);
  });
});
