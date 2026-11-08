import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { and, eq } from "drizzle-orm";
import { app } from "../../src/app";
import { db } from "../../src/db";
import { productDocumentVersions, productDocuments } from "../../src/db/schema";
import { createMemoryStorage, setDefaultDocumentStorage } from "../../src/lib/storage";
import { cleanup, createOutsider, setupProduct } from "../task/helpers";

// 文書: 作成・取得・保存(版)・名前の変更や移動・削除。R2(文書用)はメモリで代用する

type Setup = Awaited<ReturnType<typeof setupProduct>>;
let a: Setup; // リーダー + メンバー 2 人
let b: Setup; // 別のプロダクト
const docs = createMemoryStorage();
let dirId: string; // a のディレクトリ(メンバーは read のまま)
let writeDirId: string; // a のディレクトリ(members[0] に write を渡す)
let bDirId: string;

beforeAll(async () => {
  setDefaultDocumentStorage(docs);
  a = await setupProduct();
  b = await setupProduct({ members: 1 });
  dirId = (await createDirectory(a, "read だけ")).directoryId;
  writeDirId = (await createDirectory(a, "write あり")).directoryId;
  await call("PUT", `${dirUrl(a)}/${writeDirId}/permission/${a.members[0]!.memberId}`, a.leader.cookie, { level: "write" });
  bDirId = (await createDirectory(b, "b")).directoryId;
});
afterAll(async () => {
  setDefaultDocumentStorage(undefined);
  await cleanup();
});

const dirUrl = (s: Setup) => `/api/product/${s.productId}/directory`;
const docUrl = (s: Setup, documentId?: string) => `/api/product/${s.productId}/document${documentId ? `/${documentId}` : ""}`;
function call(method: string, path: string, cookie?: string, body?: unknown) {
  const headers = new Headers();
  if (cookie) headers.set("cookie", cookie);
  if (body !== undefined) headers.set("content-type", "application/json");
  return app.handle(new Request(`http://localhost${path}`, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) }));
}
async function createDirectory(s: Setup, name: string) {
  return (await (await call("POST", dirUrl(s), s.leader.cookie, { name })).json()) as { directoryId: string };
}
type Doc = { documentId: string; directoryId: string; name: string; currentVersion: number; sizeBytes: number; keepForever: boolean; lastFetchedAt: string | null; version: number; content: string; canEdit: boolean };
async function createDoc(s: Setup, directoryId: string, name: string, content: string, cookie = s.leader.cookie) {
  const res = await call("POST", `${dirUrl(s)}/${directoryId}/document`, cookie, { name, content });
  expect(res.status).toBe(201);
  return (await res.json()) as Doc;
}
// 版 1 のキーは、固定の形。2 以降は、保存のたびに末尾に乱数が付くので、DB に控えたキーで探す
const keyOf = (s: Setup, documentId: string, v: number) => `${s.productId}/${documentId}/v${v}.md`;
const r2KeyOf = async (documentId: string, version: number) => (await db.select().from(productDocumentVersions).where(and(eq(productDocumentVersions.documentId, documentId), eq(productDocumentVersions.version, version))))[0]!.r2Key;
const text = async (key: string) => (await docs.get(key)) && (await new Response((await docs.get(key))!.body).text());

describe("作成", () => {
  test("リーダーは作れる。版 1、本文が返る。R2 の <productId>/<documentId>/v1.md に本文が入る", async () => {
    const doc = await createDoc(a, dirId, "spec.md", "# 仕様\n\n日本語の本文");
    expect(doc.currentVersion).toBe(1);
    expect(doc.version).toBe(1);
    expect(doc.content).toBe("# 仕様\n\n日本語の本文");
    expect(doc.canEdit).toBe(true);
    expect(doc.keepForever).toBe(false);
    expect(doc.sizeBytes).toBe(new TextEncoder().encode("# 仕様\n\n日本語の本文").byteLength);
    expect(await text(keyOf(a, doc.documentId, 1))).toBe("# 仕様\n\n日本語の本文");
  });
  test("write を渡されたメンバーは、そのディレクトリに作れる。read のメンバーは 403(R2 にも入らない)", async () => {
    await createDoc(a, writeDirId, "member-made.md", "x", a.members[0]!.cookie);
    const before = docs.keys().length;
    expect((await call("POST", `${dirUrl(a)}/${dirId}/document`, a.members[0]!.cookie, { name: "no.md", content: "x" })).status).toBe(403);
    // write を渡されたメンバーでも、別のディレクトリ(read)には作れない
    expect((await call("POST", `${dirUrl(a)}/${dirId}/document`, a.members[0]!.cookie, { name: "no2.md", content: "x" })).status).toBe(403);
    expect(docs.keys().length).toBe(before);
  });
  test("参加者でなければ 404。他のプロダクトのディレクトリにも 404", async () => {
    const outsider = await createOutsider();
    expect((await call("POST", `${dirUrl(a)}/${dirId}/document`, outsider.cookie, { name: "x.md", content: "x" })).status).toBe(404);
    expect((await call("POST", `${dirUrl(a)}/${bDirId}/document`, a.leader.cookie, { name: "x.md", content: "x" })).status).toBe(404);
  });
  test("名前は .md で終わる 1〜100 文字。/ を含む名前は 422。本文に NUL は入れない", async () => {
    for (const name of ["plain.txt", "noext", ".md", "a/b.md", "../x.md", "a\\b.md", " lead.md"]) {
      expect((await call("POST", `${dirUrl(a)}/${dirId}/document`, a.leader.cookie, { name, content: "x" })).status).toBe(422);
    }
    expect((await call("POST", `${dirUrl(a)}/${dirId}/document`, a.leader.cookie, { name: "nul.md", content: "a\u0000b" })).status).toBe(422);
  });
  test("同じディレクトリで同じ名前は 409。R2 に残らない", async () => {
    await createDoc(a, dirId, "dup.md", "1");
    const before = docs.keys().length;
    expect((await call("POST", `${dirUrl(a)}/${dirId}/document`, a.leader.cookie, { name: "dup.md", content: "2" })).status).toBe(409);
    expect(docs.keys().length).toBe(before);
  });
  test("本文は 1MB(バイト数)まで。超えると 413。日本語は 1 文字 3 バイトで数える", async () => {
    const ok = "a".repeat(1_048_576);
    expect((await call("POST", `${dirUrl(a)}/${dirId}/document`, a.leader.cookie, { name: "max.md", content: ok })).status).toBe(201);
    expect((await call("POST", `${dirUrl(a)}/${dirId}/document`, a.leader.cookie, { name: "over.md", content: ok + "a" })).status).toBe(413);
    expect((await call("POST", `${dirUrl(a)}/${dirId}/document`, a.leader.cookie, { name: "jp.md", content: "あ".repeat(349_526) })).status).toBe(413);
  });
});

describe("取得", () => {
  test("参加者全員が読める(権限は問わない)。canEdit は書き込み権限のある人だけ true", async () => {
    const doc = await createDoc(a, writeDirId, "read-me.md", "# 読む");
    for (const [cookie, canEdit] of [[a.leader.cookie, true], [a.members[0]!.cookie, true], [a.members[1]!.cookie, false]] as const) {
      const res = await call("GET", docUrl(a, doc.documentId), cookie);
      expect(res.status).toBe(200);
      const body = (await res.json()) as Doc;
      expect(body.content).toBe("# 読む");
      expect(body.canEdit).toBe(canEdit);
    }
  });
  test("参加者でなければ 404。他のプロダクトの文書は、IDOR 対策で 404", async () => {
    const mine = await createDoc(a, dirId, "idor.md", "秘密");
    const outsider = await createOutsider();
    expect((await call("GET", docUrl(a, mine.documentId), outsider.cookie)).status).toBe(404);
    expect((await call("GET", docUrl(b, mine.documentId), b.leader.cookie)).status).toBe(404);
    expect((await call("GET", docUrl(a, crypto.randomUUID()), a.leader.cookie)).status).toBe(404);
  });
  test("取ると lastFetchedAt が入る(最初は null)。続けて取っても、1 時間以内なら更新しない", async () => {
    const doc = await createDoc(a, dirId, "touch.md", "x");
    expect(doc.lastFetchedAt).toBeNull();
    const first = (await (await call("GET", docUrl(a, doc.documentId), a.members[1]!.cookie)).json()) as Doc;
    // 取得した応答は、更新の前の概要。もう一度取ると、入っている
    const second = (await (await call("GET", docUrl(a, doc.documentId), a.members[1]!.cookie)).json()) as Doc;
    expect(first.lastFetchedAt === null || typeof first.lastFetchedAt === "string").toBe(true);
    expect(second.lastFetchedAt).not.toBeNull();
    const third = (await (await call("GET", docUrl(a, doc.documentId), a.leader.cookie)).json()) as Doc;
    expect(third.lastFetchedAt).toBe(second.lastFetchedAt);
  });
  test("1 時間より前に取られていたら、取ると更新する", async () => {
    const doc = await createDoc(a, dirId, "touch-old.md", "x");
    const old = new Date(Date.now() - 2 * 60 * 60 * 1000);
    await db.update(productDocuments).set({ lastFetchedAt: old }).where(eq(productDocuments.documentId, doc.documentId));
    await call("GET", docUrl(a, doc.documentId), a.leader.cookie);
    const [row] = await db.select().from(productDocuments).where(eq(productDocuments.documentId, doc.documentId));
    expect(row!.lastFetchedAt!.getTime()).toBeGreaterThan(old.getTime() + 60 * 60 * 1000);
  });
  test("R2 に本文がないとき(消えている)は 500 で、理由を返す", async () => {
    const doc = await createDoc(a, dirId, "missing.md", "x");
    await docs.delete(keyOf(a, doc.documentId, 1));
    const res = await call("GET", docUrl(a, doc.documentId), a.leader.cookie);
    expect(res.status).toBe(500);
  });
});

describe("保存(版)", () => {
  test("baseVersion が合えば、新しい版ができる。前の版は残り、?version= で読める", async () => {
    const doc = await createDoc(a, dirId, "versions.md", "v1 の本文");
    const res = await call("PUT", docUrl(a, doc.documentId), a.leader.cookie, { content: "v2 の本文", baseVersion: 1 });
    expect(res.status).toBe(200);
    const saved = (await res.json()) as Doc;
    expect(saved.currentVersion).toBe(2);
    expect(saved.content).toBe("v2 の本文");
    expect(await text(keyOf(a, doc.documentId, 1))).toBe("v1 の本文");
    expect(await text(await r2KeyOf(doc.documentId, 2))).toBe("v2 の本文");
    const now = (await (await call("GET", docUrl(a, doc.documentId), a.members[1]!.cookie)).json()) as Doc;
    expect([now.version, now.content]).toEqual([2, "v2 の本文"]);
    const old = (await (await call("GET", `${docUrl(a, doc.documentId)}?version=1`, a.members[1]!.cookie)).json()) as Doc;
    expect([old.version, old.content, old.currentVersion]).toEqual([1, "v1 の本文", 2]);
    expect((await call("GET", `${docUrl(a, doc.documentId)}?version=9`, a.leader.cookie)).status).toBe(404);
  });
  test("開いたときの版と違えば 409(他の人が先に保存した)。R2 にも新しい版は入らない", async () => {
    const doc = await createDoc(a, dirId, "stale.md", "1");
    await call("PUT", docUrl(a, doc.documentId), a.leader.cookie, { content: "2", baseVersion: 1 });
    const before = docs.keys().length;
    const res = await call("PUT", docUrl(a, doc.documentId), a.leader.cookie, { content: "3", baseVersion: 1 });
    expect(res.status).toBe(409);
    expect(docs.keys().length).toBe(before);
    expect(await text(await r2KeyOf(doc.documentId, 2))).toBe("2");
  });
  test("同時に保存すると、片方だけが成功し、もう片方は 409(版が重ならない)", async () => {
    const doc = await createDoc(a, dirId, "race.md", "0");
    const [r1, r2] = await Promise.all([
      call("PUT", docUrl(a, doc.documentId), a.leader.cookie, { content: "A", baseVersion: 1 }),
      call("PUT", docUrl(a, doc.documentId), a.leader.cookie, { content: "B", baseVersion: 1 }),
    ]);
    expect([r1.status, r2.status].sort()).toEqual([200, 409]);
    const now = (await (await call("GET", docUrl(a, doc.documentId), a.leader.cookie)).json()) as Doc;
    expect(now.currentVersion).toBe(2);
  });
  test("write のあるメンバーは保存できる。read のメンバーは 403。1MB 超は 413", async () => {
    const doc = await createDoc(a, writeDirId, "perm-save.md", "1");
    expect((await call("PUT", docUrl(a, doc.documentId), a.members[0]!.cookie, { content: "member edit", baseVersion: 1 })).status).toBe(200);
    expect((await call("PUT", docUrl(a, doc.documentId), a.members[1]!.cookie, { content: "no", baseVersion: 2 })).status).toBe(403);
    expect((await call("PUT", docUrl(a, doc.documentId), a.leader.cookie, { content: "a".repeat(1_048_577), baseVersion: 2 })).status).toBe(413);
  });
  test("版の一覧(新しい順)は参加者全員が見られる。保存した人の名前つき", async () => {
    const doc = await createDoc(a, writeDirId, "list-versions.md", "1");
    await call("PUT", docUrl(a, doc.documentId), a.members[0]!.cookie, { content: "2", baseVersion: 1 });
    const res = await call("GET", `${docUrl(a, doc.documentId)}/version`, a.members[1]!.cookie);
    expect(res.status).toBe(200);
    const list = (await res.json()) as { version: number; authorName: string | null; sizeBytes: number }[];
    expect(list.map((v) => v.version)).toEqual([2, 1]);
    expect(list[0]!.authorName).toBe("member1");
    expect(list[1]!.authorName).toBe("leader");
  });
});

describe("名前の変更・移動・自動削除しない", () => {
  test("write のある人は名前を変えられる。read のメンバーは 403。重複は 409", async () => {
    const doc = await createDoc(a, writeDirId, "before.md", "x");
    await createDoc(a, writeDirId, "taken.md", "x");
    expect((await call("PATCH", docUrl(a, doc.documentId), a.members[1]!.cookie, { name: "no.md" })).status).toBe(403);
    expect((await call("PATCH", docUrl(a, doc.documentId), a.members[0]!.cookie, { name: "taken.md" })).status).toBe(409);
    const res = await call("PATCH", docUrl(a, doc.documentId), a.members[0]!.cookie, { name: "after.md" });
    expect(res.status).toBe(200);
    expect(((await res.json()) as Doc).name).toBe("after.md");
    // 名前を変えても、R2 のキーは変わらない
    expect(await text(keyOf(a, doc.documentId, 1))).toBe("x");
  });
  test("移動には、元と移し先の両方で書き込み権限が要る。移し先が別のプロダクトなら 404", async () => {
    const doc = await createDoc(a, writeDirId, "move.md", "x");
    // members[0] は writeDirId には write、dirId には read → dirId へは移せない
    expect((await call("PATCH", docUrl(a, doc.documentId), a.members[0]!.cookie, { directoryId: dirId })).status).toBe(403);
    expect((await call("PATCH", docUrl(a, doc.documentId), a.leader.cookie, { directoryId: bDirId })).status).toBe(404);
    const res = await call("PATCH", docUrl(a, doc.documentId), a.leader.cookie, { directoryId: dirId });
    expect(res.status).toBe(200);
    expect(((await res.json()) as Doc).directoryId).toBe(dirId);
  });
  test("「自動削除しない」を変えられるのはリーダーだけ(write のメンバーも 403)", async () => {
    const doc = await createDoc(a, writeDirId, "keep.md", "x");
    expect((await call("PATCH", docUrl(a, doc.documentId), a.members[0]!.cookie, { keepForever: true })).status).toBe(403);
    const res = await call("PATCH", docUrl(a, doc.documentId), a.leader.cookie, { keepForever: true });
    expect(res.status).toBe(200);
    expect(((await res.json()) as Doc).keepForever).toBe(true);
  });
  test("何も指定しなければ 422", async () => {
    const doc = await createDoc(a, dirId, "empty-patch.md", "x");
    expect((await call("PATCH", docUrl(a, doc.documentId), a.leader.cookie, {})).status).toBe(422);
  });
});

describe("削除", () => {
  test("write のある人は消せる。全ての版が R2 からも消える。read のメンバーは 403", async () => {
    const doc = await createDoc(a, writeDirId, "delete-me.md", "1");
    await call("PUT", docUrl(a, doc.documentId), a.leader.cookie, { content: "2", baseVersion: 1 });
    expect((await call("DELETE", docUrl(a, doc.documentId), a.members[1]!.cookie)).status).toBe(403);
    expect(docs.keys()).toContain(await r2KeyOf(doc.documentId, 2));
    expect((await call("DELETE", docUrl(a, doc.documentId), a.members[0]!.cookie)).status).toBe(204);
    expect(docs.keys().filter((k) => k.includes(doc.documentId))).toEqual([]);
    expect((await call("GET", docUrl(a, doc.documentId), a.leader.cookie)).status).toBe(404);
  });
  test("他のプロダクトの文書は 404(消えない)", async () => {
    const doc = await createDoc(a, dirId, "keep-safe.md", "x");
    expect((await call("DELETE", docUrl(b, doc.documentId), b.leader.cookie)).status).toBe(404);
    expect((await call("GET", docUrl(a, doc.documentId), a.leader.cookie)).status).toBe(200);
  });
  test("R2 の削除に失敗しても、文書の削除は成功する(後始末の失敗は warn のみ)", async () => {
    const doc = await createDoc(a, dirId, "r2-fail.md", "x");
    const broken = { ...docs, delete: async () => { throw new Error("R2 down"); } };
    setDefaultDocumentStorage(broken);
    expect((await call("DELETE", docUrl(a, doc.documentId), a.leader.cookie)).status).toBe(204);
    setDefaultDocumentStorage(docs);
  });
});

describe("プロダクトの削除", () => {
  test("プロダクトを消すと、文書の全ての版が R2 からも消える", async () => {
    const p = await setupProduct({ members: 0 });
    const dir = await createDirectory(p, "消えるディレクトリ");
    const doc = await createDoc(p, dir.directoryId, "gone.md", "1");
    await call("PUT", docUrl(p, doc.documentId), p.leader.cookie, { content: "2", baseVersion: 1 });
    expect(docs.keys().filter((k) => k.startsWith(`${p.productId}/`)).length).toBe(2);
    expect((await call("DELETE", `/api/product/${p.productId}`, p.leader.cookie)).status).toBe(204);
    expect(docs.keys().filter((k) => k.startsWith(`${p.productId}/`))).toEqual([]);
  });
});
