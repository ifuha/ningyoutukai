import { afterAll, afterEach, beforeAll, describe, expect, spyOn, test } from "bun:test";
import { eq } from "drizzle-orm";
import { app } from "../../src/app";
import { db } from "../../src/db";
import { documentLocks, productDocumentVersions, productDocuments, tasks } from "../../src/db/schema";
import { runDocumentAutoDelete } from "../../src/lib/document-auto-delete";
import { mailer } from "../../src/lib/mailer";
import { createMemoryStorage, setDefaultDocumentStorage } from "../../src/lib/storage";
import { cleanup, setupProduct } from "../task/helpers";

// 文書の自動削除: 長い間呼び出されない文書を消し、参加者全員にメールで知らせる。時間は、`now` を未来にして再現する

const DAY = 24 * 60 * 60 * 1000;
type Setup = Awaited<ReturnType<typeof setupProduct>>;
let a: Setup; // リーダー + メンバー 2 人
let b: Setup;
let dirA: string;
let dirB: string;
const docs = createMemoryStorage();
const sendSpy = spyOn(mailer, "send");

beforeAll(async () => {
  setDefaultDocumentStorage(docs);
  sendSpy.mockResolvedValue({ ok: true });
  a = await setupProduct();
  b = await setupProduct({ members: 1 });
  dirA = (await createDirectory(a, "仕様")).directoryId;
  dirB = (await createDirectory(b, "b")).directoryId;
});
afterAll(async () => {
  setDefaultDocumentStorage(undefined);
  await cleanup();
});
afterEach(() => sendSpy.mockClear());

function call(method: string, path: string, cookie?: string, body?: unknown) {
  const headers = new Headers();
  if (cookie) headers.set("cookie", cookie);
  if (body !== undefined) headers.set("content-type", "application/json");
  return app.handle(new Request(`http://localhost${path}`, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) }));
}
async function createDirectory(s: Setup, name: string) {
  return (await (await call("POST", `/api/product/${s.productId}/directory`, s.leader.cookie, { name })).json()) as { directoryId: string };
}
let n = 0;
async function newDoc(s = a, directoryId = dirA, name = `auto-${++n}.md`) {
  const res = await call("POST", `/api/product/${s.productId}/directory/${directoryId}/document`, s.leader.cookie, { name, content: "# x" });
  expect(res.status).toBe(201);
  return ((await res.json()) as { documentId: string }).documentId;
}
const exists = async (documentId: string) => (await db.select().from(productDocuments).where(eq(productDocuments.documentId, documentId))).length === 1;
const inDays = (days: number) => new Date(Date.now() + days * DAY);
const run = (now: Date) => runDocumentAutoDelete(docs, now);

describe("いつ消えるか", () => {
  test("初期の 7 日。6 日後は消えず、8 日後に消える(DB の行、版、R2 の本文のすべて)", async () => {
    const id = await newDoc();
    const keys = docs.keys().filter((k) => k.includes(id));
    expect(keys.length).toBe(1);
    expect((await run(inDays(6))).flatMap((r) => r.deleted.map((d) => d.documentId))).not.toContain(id);
    expect(await exists(id)).toBe(true);
    const results = await run(inDays(8));
    expect(results.flatMap((r) => r.deleted.map((d) => d.documentId))).toContain(id);
    expect(await exists(id)).toBe(false);
    expect(await db.select().from(productDocumentVersions).where(eq(productDocumentVersions.documentId, id))).toEqual([]);
    expect(docs.keys().filter((k) => k.includes(id))).toEqual([]);
  });

  test("一度も呼び出されていない文書は、作成した日時から数える。呼び出されていれば、最後に呼び出された日時から数える", async () => {
    const never = await newDoc();
    const fetched = await newDoc();
    const stale = await newDoc();
    const future = inDays(30);
    // 30 日後の時点で、fetched は 1 日前に呼び出された / stale は 8 日前
    await db.update(productDocuments).set({ lastFetchedAt: new Date(future.getTime() - 1 * DAY) }).where(eq(productDocuments.documentId, fetched));
    await db.update(productDocuments).set({ lastFetchedAt: new Date(future.getTime() - 8 * DAY) }).where(eq(productDocuments.documentId, stale));
    await run(future);
    expect(await exists(never)).toBe(false);
    expect(await exists(fetched)).toBe(true);
    expect(await exists(stale)).toBe(false);
  });

  test("文書を取ると(画面でも CLI でも)、日時が更新されて、消えるのが先に延びる", async () => {
    const id = await newDoc();
    await db.update(productDocuments).set({ lastFetchedAt: new Date(Date.now() - 20 * DAY), createdAt: new Date(Date.now() - 30 * DAY) }).where(eq(productDocuments.documentId, id));
    expect((await call("GET", `/api/product/${a.productId}/document/${id}`, a.members[0]!.cookie)).status).toBe(200);
    await run(new Date());
    expect(await exists(id)).toBe(true);
  });

  test("もう一度実行しても、何も消えない(消えたものは、もうない)", async () => {
    const id = await newDoc();
    await run(inDays(8));
    expect(await exists(id)).toBe(false);
    expect((await run(inDays(8))).flatMap((r) => r.deleted)).toEqual([]);
  });
});

describe("プロダクトの設定(日数)", () => {
  test("リーダーが日数を変えられる。3 日にすると、4 日後に消える。ほかのプロダクトには効かない", async () => {
    const p = await setupProduct({ members: 1 });
    const dir = (await createDirectory(p, "d")).directoryId;
    const id = await newDoc(p, dir);
    const other = await newDoc(b, dirB);
    const res = await call("PATCH", `/api/product/${p.productId}/document-setting`, p.leader.cookie, { documentAutoDeleteDays: 3 });
    expect(res.status).toBe(200);
    expect(((await res.json()) as { documentAutoDeleteDays: number }).documentAutoDeleteDays).toBe(3);
    await run(inDays(4));
    expect(await exists(id)).toBe(false);
    expect(await exists(other)).toBe(true); // 7 日の設定のプロダクト
  });
  test("メンバーは変えられない(403)。参加者でなければ 404。1〜3650 の整数だけ(範囲外・小数・null は 422)", async () => {
    const url = `/api/product/${a.productId}/document-setting`;
    expect((await call("PATCH", url, a.members[0]!.cookie, { documentAutoDeleteDays: 30 })).status).toBe(403);
    expect((await call("PATCH", `/api/product/${crypto.randomUUID()}/document-setting`, a.leader.cookie, { documentAutoDeleteDays: 30 })).status).toBe(404);
    for (const bad of [0, -1, 3651, 1.5, null]) {
      expect((await call("PATCH", url, a.leader.cookie, { documentAutoDeleteDays: bad })).status).toBe(422);
    }
  });
  test("プロダクトの応答に、日数が出る(プロダクト設定の画面が表示する)", async () => {
    const res = await call("GET", `/api/product/${b.productId}`, b.leader.cookie);
    expect(((await res.json()) as { documentAutoDeleteDays: number }).documentAutoDeleteDays).toBe(7);
  });
});

describe("消さない文書", () => {
  test("「自動削除しない」(keepForever)の文書は、消さない", async () => {
    const id = await newDoc();
    await call("PATCH", `/api/product/${a.productId}/document/${id}`, a.leader.cookie, { keepForever: true });
    await run(inDays(400));
    expect(await exists(id)).toBe(true);
    await call("PATCH", `/api/product/${a.productId}/document/${id}`, a.leader.cookie, { keepForever: false });
    await run(inDays(400));
    expect(await exists(id)).toBe(false);
  });

  test("未完了のタスクに結びついている文書は、消さない(個別に渡しても、ディレクトリで渡しても)。完了したら、消える", async () => {
    const dir = (await createDirectory(a, "タスク付き")).directoryId;
    const direct = await newDoc(a, dirA);
    const viaDir = await newDoc(a, dir);
    const t1 = await call("POST", `/api/product/${a.productId}/task`, a.leader.cookie, { taskName: "個別", productMemberId: a.members[0]!.memberId, documentIds: [direct] });
    const t2 = await call("POST", `/api/product/${a.productId}/task`, a.leader.cookie, { taskName: "ディレクトリ", productMemberId: a.members[0]!.memberId, directoryIds: [dir] });
    const ids = [((await t1.json()) as { taskId: string }).taskId, ((await t2.json()) as { taskId: string }).taskId];
    await run(inDays(400));
    expect(await exists(direct)).toBe(true);
    expect(await exists(viaDir)).toBe(true);
    for (const taskId of ids) await db.update(tasks).set({ status: "completed", completedAt: new Date() }).where(eq(tasks.taskId, taskId));
    await run(inDays(400));
    expect(await exists(direct)).toBe(false);
    expect(await exists(viaDir)).toBe(false);
  });

  test("編集中(有効なロックがある)の文書は、消さない。ロックが外れたら消える", async () => {
    const id = await newDoc();
    await call("POST", `/api/product/${a.productId}/document/${id}/lock`, a.leader.cookie);
    const future = inDays(10);
    // 10 日後の時点で、1 分前まで編集していた
    await db.update(documentLocks).set({ lastEditedAt: new Date(future.getTime() - 60_000), lastSeenAt: new Date(future.getTime() - 10_000) }).where(eq(documentLocks.documentId, id));
    await run(future);
    expect(await exists(id)).toBe(true);
    await run(inDays(11));
    expect(await exists(id)).toBe(false);
  });
});

describe("メール(参加者全員)", () => {
  test("消したら、そのプロダクトの参加者全員(リーダーを含む)に、1 人 1 通。消した文書の一覧つき", async () => {
    const p = await setupProduct({ members: 2 });
    const dir = (await createDirectory(p, "手順")).directoryId;
    const one = await newDoc(p, dir, "one.md");
    const two = await newDoc(p, dir, "two.md");
    await db.update(productDocuments).set({ lastFetchedAt: new Date(Date.now() + 10 * DAY - 9 * DAY) }).where(eq(productDocuments.documentId, two));
    sendSpy.mockClear();
    const results = await run(inDays(10));
    const mine = results.find((r) => r.productId === p.productId)!;
    expect(mine.deleted.map((d) => d.name).sort()).toEqual(["one.md", "two.md"]);
    expect(await exists(one)).toBe(false);
    const sent = sendSpy.mock.calls.map((c) => c[0]).filter((m) => m.subject.includes(`文書を自動で削除しました`) && [p.leader.email, ...p.members.map((m) => m.email)].includes(m.to as string));
    expect(sent.map((m) => m.to).sort()).toEqual([p.leader.email, ...p.members.map((m) => m.email)].sort());
    const text = sent[0]!.text;
    expect(text).toContain("手順/one.md(一度も呼び出されていません)");
    expect(text).toContain("手順/two.md(最後に呼び出されたのは 9 日前)");
    expect(text).toContain("7 日");
    expect(text).toContain("リーダーに「自動削除しない」");
  });
  test("何も消さなかったときは、送らない。ほかのプロダクトの参加者には、送らない", async () => {
    await run(new Date());
    expect(sendSpy).not.toHaveBeenCalled();
    const p = await setupProduct({ members: 1 });
    const dir = (await createDirectory(p, "x")).directoryId;
    await newDoc(p, dir);
    sendSpy.mockClear();
    await run(inDays(10));
    const recipients = sendSpy.mock.calls.map((c) => c[0].to);
    expect(recipients).not.toContain(a.leader.email);
    expect(recipients).not.toContain(b.leader.email);
  });
  test("メールの送信に失敗しても、削除は成功する。R2 の削除に失敗しても、DB の削除は成功する", async () => {
    const id = await newDoc();
    sendSpy.mockResolvedValue({ ok: false, error: "boom" });
    const broken = { ...docs, delete: async () => { throw new Error("R2 down"); } };
    const results = await runDocumentAutoDelete(broken, inDays(8));
    expect(results.flatMap((r) => r.deleted.map((d) => d.documentId))).toContain(id);
    expect(await exists(id)).toBe(false);
    sendSpy.mockResolvedValue({ ok: true });
  });
});
