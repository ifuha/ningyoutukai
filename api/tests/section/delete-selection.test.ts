import { afterAll, describe, expect, test } from "bun:test";
import { eq } from "drizzle-orm";
import { Elysia } from "elysia";
import { db } from "../../src/db";
import { productNotes, sections } from "../../src/db/schema";
import { productNoteRoutes } from "../../src/routes/product-note";
import { sectionRoutes } from "../../src/routes/section";
import { cleanup, setupProduct } from "../task/helpers";

// 一括削除(論理削除)の API。期限切れの物理削除(cleanup)は `api/tests/lib/soft-delete-cleanup.test.ts` で見る

afterAll(cleanup);

const app = new Elysia().use(sectionRoutes).use(productNoteRoutes);

function req(method: string, path: string, opts: { cookie?: string; body?: unknown } = {}) {
  const headers = new Headers();
  if (opts.cookie) headers.set("cookie", opts.cookie);
  if (opts.body !== undefined) headers.set("content-type", "application/json");
  return app.handle(
    new Request(`http://localhost${path}`, {
      method,
      headers,
      body: opts.body === undefined ? undefined : JSON.stringify(opts.body),
    }),
  );
}

const deleteSelectionUrl = (productId: string) => `/api/product/${productId}/delete-selection`;

async function insertSection(productId: string) {
  const [row] = await db
    .insert(sections)
    .values({ productId, sectionName: `s-${crypto.randomUUID().slice(0, 8)}`, color: "red" })
    .returning();
  return row;
}

async function insertNote(productId: string, createdBy: string) {
  const [row] = await db
    .insert(productNotes)
    .values({ productId, content: "メモ", createdBy })
    .returning();
  return row;
}

async function findSection(sectionId: string) {
  const [row] = await db.select().from(sections).where(eq(sections.sectionId, sectionId));
  return row;
}

async function findNote(noteId: string) {
  const [row] = await db.select().from(productNotes).where(eq(productNotes.noteId, noteId));
  return row;
}

describe("一括削除(論理削除) POST /delete-selection", () => {
  test("リーダーがセクションとメモを論理削除できる(一覧には出ない)", async () => {
    const { productId, leader } = await setupProduct();
    const s1 = await insertSection(productId);
    const s2 = await insertSection(productId);
    const note = await insertNote(productId, leader.userId);

    // 前: 一覧には出ている(メモは leader が見える。作成者は leader)
    const beforeNotes = await (await req("GET", `/api/product/${productId}/note`, { cookie: leader.cookie })).json();
    expect(beforeNotes.map((n: { noteId: string }) => n.noteId)).toContain(note.noteId);

    const res = await req("POST", deleteSelectionUrl(productId), {
      cookie: leader.cookie,
      body: { sectionIds: [s1.sectionId, s2.sectionId], noteIds: [note.noteId] },
    });
    expect(res.status).toBe(204);

    // 論理削除: deletedAt が入ったまま行は残る
    expect((await findSection(s1.sectionId))?.deletedAt).not.toBeNull();
    expect((await findSection(s2.sectionId))?.deletedAt).not.toBeNull();
    expect((await findNote(note.noteId))?.deletedAt).not.toBeNull();

    // 一覧には出ない(セクション・メモ)
    const sectionsList = await (await req("GET", `/api/product/${productId}/section`, { cookie: leader.cookie })).json();
    expect(sectionsList.map((s: { sectionId: string }) => s.sectionId)).not.toContain(s1.sectionId);
    expect(sectionsList.map((s: { sectionId: string }) => s.sectionId)).not.toContain(s2.sectionId);
    const notesList = await (await req("GET", `/api/product/${productId}/note`, { cookie: leader.cookie })).json();
    expect(notesList.map((n: { noteId: string }) => n.noteId)).not.toContain(note.noteId);
  });

  test("リーダー以外は、セクションの削除で 403(論理削除されない)", async () => {
    const { productId, members } = await setupProduct();
    const s = await insertSection(productId);
    const res = await req("POST", deleteSelectionUrl(productId), {
      cookie: members[0]!.cookie,
      body: { sectionIds: [s.sectionId] },
    });
    expect(res.status).toBe(403);
    expect((await findSection(s.sectionId))?.deletedAt).toBeNull();
  });

  test("すべて空なら 422", async () => {
    const { productId, leader } = await setupProduct();
    const res = await req("POST", deleteSelectionUrl(productId), { cookie: leader.cookie, body: {} });
    expect(res.status).toBe(422);
  });

  test("見つからないものは 404、変更しない", async () => {
    const { productId, leader } = await setupProduct();
    const s = await insertSection(productId);
    const res = await req("POST", deleteSelectionUrl(productId), {
      cookie: leader.cookie,
      body: { sectionIds: [crypto.randomUUID()], noteIds: [] },
    });
    expect(res.status).toBe(404);
    expect((await findSection(s.sectionId))?.deletedAt).toBeNull();
  });

  test("論理削除済み(deletedAt が入った)セクションも、再指定できる(deletedAt が更新される)", async () => {
    const { productId, leader } = await setupProduct();
    const s = await insertSection(productId);

    const res = await req("POST", deleteSelectionUrl(productId), {
      cookie: leader.cookie,
      body: { sectionIds: [s.sectionId] },
    });
    expect(res.status).toBe(204);
    const first = await findSection(s.sectionId);
    expect(first?.deletedAt).not.toBeNull();

    // 古い deletedAt を入れてからもう一度 → 204(deletedAt が更新される)
    const past = new Date(Date.now() - 60_000);
    await db.update(sections).set({ deletedAt: past }).where(eq(sections.sectionId, s.sectionId));
    const res2 = await req("POST", deleteSelectionUrl(productId), {
      cookie: leader.cookie,
      body: { sectionIds: [s.sectionId] },
    });
    expect(res2.status).toBe(204);
    const second = await findSection(s.sectionId);
    expect(second?.deletedAt?.getTime()).toBeGreaterThan(past.getTime());
  });
});
