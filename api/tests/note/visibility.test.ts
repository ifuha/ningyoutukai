import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { eq } from "drizzle-orm";
import { app } from "../../src/app";
import { db } from "../../src/db";
import { productNotes } from "../../src/db/schema";
import { cleanup, createOutsider, setupProduct } from "../task/helpers";

// メモの公開範囲と権限。公開 = メンバー全員に見える、非公開 = 作成者だけ。非公開は、作成者が NULL(持ち主がいない)でも他人に見せない。作成者が NULL の公開メモは、全員が変更できる

type Setup = Awaited<ReturnType<typeof setupProduct>>;
let a: Setup; // リーダー + メンバー 2 人
let b: Setup; // 別のプロダクト

beforeAll(async () => {
  a = await setupProduct();
  b = await setupProduct({ members: 1 });
});
afterAll(cleanup);

const url = (productId: string, noteId?: string) => `/api/product/${productId}/note${noteId ? `/${noteId}` : ""}`;

function call(method: string, path: string, cookie?: string, body?: unknown) {
  const headers = new Headers();
  if (cookie) headers.set("cookie", cookie);
  if (body !== undefined) headers.set("content-type", "application/json");
  return app.handle(new Request(`http://localhost${path}`, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) }));
}

async function insertNote(productId: string, values: Partial<typeof productNotes.$inferInsert>) {
  const [row] = await db.insert(productNotes).values({ productId, ...values }).returning();
  return row!;
}
const findNote = async (noteId: string) => (await db.select().from(productNotes).where(eq(productNotes.noteId, noteId)))[0];
async function listIds(productId: string, cookie: string) {
  const res = await call("GET", url(productId), cookie);
  expect(res.status).toBe(200);
  return ((await res.json()) as { noteId: string }[]).map((n) => n.noteId);
}

describe("作成", () => {
  test("作成者が入り、既定は非公開で、作成者の名前が返る", async () => {
    const m = a.members[0]!;
    const res = await call("POST", url(a.productId), m.cookie, { x: 1, y: 2 });
    expect(res.status).toBe(201);
    const body = (await res.json()) as Record<string, unknown>;
    expect(body.createdBy).toBe(m.userId);
    expect(body.isPublic).toBe(false);
    expect(body.authorName).toBe("member1");
    expect((await findNote(body.noteId as string))!.createdBy).toBe(m.userId);
  });

  test("プロダクトのメンバーでなければ 404", async () => {
    const outsider = await createOutsider();
    expect((await call("POST", url(a.productId), outsider.cookie, { x: 0, y: 0 })).status).toBe(404);
  });
});

describe("一覧の見える範囲", () => {
  test("公開・自分の非公開は見える。他人の非公開と、作成者 NULL の非公開は見えない", async () => {
    const m1 = a.members[0]!;
    const m2 = a.members[1]!;
    const pub = await insertNote(a.productId, { createdBy: m2.userId, isPublic: true });
    const mine = await insertNote(a.productId, { createdBy: m1.userId });
    const orphanPublic = await insertNote(a.productId, { createdBy: null, isPublic: true });
    const orphanPrivate = await insertNote(a.productId, { createdBy: null });
    const theirs = await insertNote(a.productId, { createdBy: m2.userId });

    const ids = await listIds(a.productId, m1.cookie);
    expect(ids).toEqual(expect.arrayContaining([pub.noteId, mine.noteId, orphanPublic.noteId]))
    expect(ids).not.toContain(theirs.noteId);
    // 作成者が NULL の非公開(作成者を保存する前のメモなど)は、誰にも見せない(リーダーにも)
    expect(ids).not.toContain(orphanPrivate.noteId);
    expect(await listIds(a.productId, a.leader.cookie)).not.toContain(orphanPrivate.noteId);
    // リーダーでも、他人の非公開は見えない
    expect(await listIds(a.productId, a.leader.cookie)).not.toContain(theirs.noteId);
    expect(await listIds(a.productId, m2.cookie)).toContain(theirs.noteId);
  });

  test("authorName は users から引き、作成者 NULL なら null", async () => {
    const orphan = await insertNote(a.productId, { createdBy: null, isPublic: true });
    const pub = await insertNote(a.productId, { createdBy: a.members[1]!.userId, isPublic: true });
    const res = await call("GET", url(a.productId), a.leader.cookie);
    const list = (await res.json()) as { noteId: string; authorName: string | null; createdBy: string | null; isPublic: boolean }[];
    expect(list.find((n) => n.noteId === orphan.noteId)).toMatchObject({ authorName: null, createdBy: null, isPublic: true });
    expect(list.find((n) => n.noteId === pub.noteId)).toMatchObject({ authorName: "member2", isPublic: true });
  });

  test("メンバーでなければ 404", async () => {
    const outsider = await createOutsider();
    expect((await call("GET", url(a.productId), outsider.cookie)).status).toBe(404);
  });
});

describe("更新", () => {
  test("作成者は内容・位置・公開フラグを変えられる", async () => {
    const m = a.members[0]!;
    const n = await insertNote(a.productId, { createdBy: m.userId });
    const res = await call("PATCH", url(a.productId, n.noteId), m.cookie, { content: "hi", x: 5, y: 6, isPublic: true });
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ content: "hi", x: 5, y: 6, isPublic: true, authorName: "member1" });
  });

  test("他人の公開メモは 403、変更されない(リーダーでも)", async () => {
    const n = await insertNote(a.productId, { createdBy: a.members[0]!.userId, isPublic: true, content: "orig" });
    expect((await call("PATCH", url(a.productId, n.noteId), a.members[1]!.cookie, { content: "x" })).status).toBe(403);
    expect((await call("PATCH", url(a.productId, n.noteId), a.leader.cookie, { isPublic: false })).status).toBe(403);
    const row = await findNote(n.noteId);
    expect(row!.content).toBe("orig");
    expect(row!.isPublic).toBe(true);
  });

  test("他人の非公開メモは 404(存在を漏らさない)", async () => {
    const n = await insertNote(a.productId, { createdBy: a.members[0]!.userId });
    expect((await call("PATCH", url(a.productId, n.noteId), a.members[1]!.cookie, { content: "x" })).status).toBe(404);
  });

  test("作成者 NULL の公開メモは、メンバー全員が変更できる。非公開は 404", async () => {
    const hidden = await insertNote(a.productId, { createdBy: null });
    expect((await call("PATCH", url(a.productId, hidden.noteId), a.members[1]!.cookie, { content: "x" })).status).toBe(404);
    const n = await insertNote(a.productId, { createdBy: null, isPublic: true });
    const res = await call("PATCH", url(a.productId, n.noteId), a.members[1]!.cookie, { content: "ok" });
    expect(res.status).toBe(200);
    expect((await findNote(n.noteId))!.content).toBe("ok");
  });

  test("別のプロダクトのメモ・非メンバー・存在しない id は 404", async () => {
    const other = await insertNote(b.productId, { createdBy: b.leader.userId, isPublic: true });
    expect((await call("PATCH", url(a.productId, other.noteId), a.leader.cookie, { content: "x" })).status).toBe(404);
    const outsider = await createOutsider();
    expect((await call("PATCH", url(b.productId, other.noteId), outsider.cookie, { content: "x" })).status).toBe(404);
    expect((await call("PATCH", url(a.productId, crypto.randomUUID()), a.leader.cookie, { content: "x" })).status).toBe(404);
  });
});

describe("削除", () => {
  test("作成者は削除できる", async () => {
    const m = a.members[0]!;
    const n = await insertNote(a.productId, { createdBy: m.userId });
    expect((await call("DELETE", url(a.productId, n.noteId), m.cookie)).status).toBe(204);
    expect(await findNote(n.noteId)).toBeUndefined();
  });

  test("リーダーは他人の公開メモを削除できる", async () => {
    const n = await insertNote(a.productId, { createdBy: a.members[0]!.userId, isPublic: true });
    expect((await call("DELETE", url(a.productId, n.noteId), a.leader.cookie)).status).toBe(204);
  });

  test("リーダーでも、他人の非公開メモは 404", async () => {
    const n = await insertNote(a.productId, { createdBy: a.members[0]!.userId });
    expect((await call("DELETE", url(a.productId, n.noteId), a.leader.cookie)).status).toBe(404);
    expect(await findNote(n.noteId)).toBeDefined();
  });

  test("リーダーでないメンバーが他人の公開メモを消すのは 403", async () => {
    const n = await insertNote(a.productId, { createdBy: a.members[0]!.userId, isPublic: true });
    expect((await call("DELETE", url(a.productId, n.noteId), a.members[1]!.cookie)).status).toBe(403);
    expect(await findNote(n.noteId)).toBeDefined();
  });

  test("他人の非公開メモは 404", async () => {
    const n = await insertNote(a.productId, { createdBy: a.members[0]!.userId });
    expect((await call("DELETE", url(a.productId, n.noteId), a.members[1]!.cookie)).status).toBe(404);
  });

  test("作成者 NULL の公開メモは、メンバー全員が削除できる。非公開は 404", async () => {
    const hidden = await insertNote(a.productId, { createdBy: null });
    expect((await call("DELETE", url(a.productId, hidden.noteId), a.members[1]!.cookie)).status).toBe(404);
    const n = await insertNote(a.productId, { createdBy: null, isPublic: true });
    expect((await call("DELETE", url(a.productId, n.noteId), a.members[1]!.cookie)).status).toBe(204);
  });
});

describe("リビジョン", () => {
  test("他人の非公開メモの変更では版が変わらない。公開にすると変わる", async () => {
    const rev = async (cookie: string) => ((await (await call("GET", `/api/product/${a.productId}/revision`, cookie)).json()) as { revision: string }).revision;
    const m1 = a.members[0]!;
    const n = await insertNote(a.productId, { createdBy: m1.userId });
    const before = await rev(a.leader.cookie);
    await call("PATCH", url(a.productId, n.noteId), m1.cookie, { content: "秘密" });
    expect(await rev(a.leader.cookie)).toBe(before);
    await call("PATCH", url(a.productId, n.noteId), m1.cookie, { isPublic: true });
    expect(await rev(a.leader.cookie)).not.toBe(before);
  });
});
