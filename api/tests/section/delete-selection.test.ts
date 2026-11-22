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

  test("soft delete 中のものを、もう一度まとめて削除すると 404(deletedAt は変えない)", async () => {
    const { productId, leader } = await setupProduct();
    const s = await insertSection(productId);
    expect((await req("POST", deleteSelectionUrl(productId), { cookie: leader.cookie, body: { sectionIds: [s.sectionId] } })).status).toBe(204);
    const first = (await findSection(s.sectionId))?.deletedAt;

    const res = await req("POST", deleteSelectionUrl(productId), { cookie: leader.cookie, body: { sectionIds: [s.sectionId] } });
    expect(res.status).toBe(404);
    // 期限(10 分)を延ばさない
    expect((await findSection(s.sectionId))?.deletedAt).toEqual(first);
  });
});

// soft delete 中のセクション・メモは、見つからないのと同じ。操作は成功(2xx)せず、行も変わらない。
// 返すステータスは、各エンドポイントの「見つからない」ときと同じ(URL の ID は 404、本文で指したセクションは 422)
describe("soft delete 中のセクション・メモへの操作", () => {
  type Ctx = Awaited<ReturnType<typeof setupProduct>> & { sectionId: string; noteId: string };
  const cases: [string, number, (c: Ctx) => Promise<Response>][] = [
    ["セクションの更新", 404, (c) => req("PATCH", `/api/product/${c.productId}/section/${c.sectionId}`, { cookie: c.leader.cookie, body: { sectionName: "変更" } })],
    ["セクションの削除", 404, (c) => req("DELETE", `/api/product/${c.productId}/section/${c.sectionId}`, { cookie: c.leader.cookie })],
    ["まとめて移動(セクション)", 422, (c) => req("POST", `/api/product/${c.productId}/move`, { cookie: c.leader.cookie, body: { sections: [{ sectionId: c.sectionId, x: 9, y: 9 }] } })],
    ["メンバーを所属させる", 422, (c) => req("PATCH", `/api/product/${c.productId}/member/${c.members[0]!.memberId}/position`, { cookie: c.leader.cookie, body: { positionX: 1, positionY: 1, sectionId: c.sectionId } })],
    ["メモの更新", 404, (c) => req("PATCH", `/api/product/${c.productId}/note/${c.noteId}`, { cookie: c.leader.cookie, body: { content: "変更" } })],
    ["メモの削除", 404, (c) => req("DELETE", `/api/product/${c.productId}/note/${c.noteId}`, { cookie: c.leader.cookie })],
    ["まとめて移動(メモ)", 404, (c) => req("POST", `/api/product/${c.productId}/move`, { cookie: c.leader.cookie, body: { notes: [{ noteId: c.noteId, x: 9, y: 9 }] } })],
  ];

  for (const [name, expected, run] of cases) {
    test(`${name}は ${expected}、行は soft delete のまま残る`, async () => {
      const product = await setupProduct({ members: 1 });
      const section = await insertSection(product.productId);
      const note = await insertNote(product.productId, product.leader.userId);
      const del = await req("POST", deleteSelectionUrl(product.productId), {
        cookie: product.leader.cookie,
        body: { sectionIds: [section.sectionId], noteIds: [note.noteId] },
      });
      expect(del.status).toBe(204);
      const before = { section: await findSection(section.sectionId), note: await findNote(note.noteId) };

      const res = await run({ ...product, sectionId: section.sectionId, noteId: note.noteId });
      expect(res.status).toBe(expected);
      // 物理削除も、中身の変更もされない(戻せる状態のまま)
      expect(await findSection(section.sectionId)).toEqual(before.section);
      expect(await findNote(note.noteId)).toEqual(before.note);
    });
  }
});
