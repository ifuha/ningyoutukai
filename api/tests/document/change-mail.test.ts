import { afterAll, afterEach, beforeAll, describe, expect, spyOn, test } from "bun:test";
import { eq } from "drizzle-orm";
import { app } from "../../src/app";
import { db } from "../../src/db";
import { tasks } from "../../src/db/schema";
import { mailer } from "../../src/lib/mailer";
import { createMemoryStorage, setDefaultDocumentStorage } from "../../src/lib/storage";
import { cleanup, setupProduct } from "../task/helpers";

// 文書を直した(保存した)とき、その文書が割り振られたメンバーにメールで知らせる(要件が変わったことに気づけるように)

type Setup = Awaited<ReturnType<typeof setupProduct>>;
let a: Setup; // リーダー + メンバー 3 人
let dirId: string;
const sendSpy = spyOn(mailer, "send");

beforeAll(async () => {
  setDefaultDocumentStorage(createMemoryStorage());
  sendSpy.mockResolvedValue({ ok: true });
  a = await setupProduct({ members: 3 });
  dirId = (await createDirectory("仕様")).directoryId;
  for (const m of a.members) await call("PUT", `/api/product/${a.productId}/directory/${dirId}/permission/${m.memberId}`, a.leader.cookie, { level: "write" });
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
async function createDirectory(name: string) {
  return (await (await call("POST", `/api/product/${a.productId}/directory`, a.leader.cookie, { name })).json()) as { directoryId: string };
}
let n = 0;
async function newDoc(directoryId = dirId) {
  const res = await call("POST", `/api/product/${a.productId}/directory/${directoryId}/document`, a.leader.cookie, { name: `chg-${++n}.md`, content: "v1" });
  return ((await res.json()) as { documentId: string }).documentId;
}
async function assign(member: Setup["members"][number], extra: Record<string, unknown>, taskName = "タスク") {
  const res = await call("POST", `/api/product/${a.productId}/task`, a.leader.cookie, { taskName, productMemberId: member.memberId, ...extra });
  expect(res.status).toBe(201);
  sendSpy.mockClear(); // タスクの割り振りメールは数えない
  return ((await res.json()) as { taskId: string }).taskId;
}
const save = (documentId: string, cookie: string, extra: Record<string, unknown> = {}, baseVersion = 1) =>
  call("PUT", `/api/product/${a.productId}/document/${documentId}`, cookie, { content: "v2", baseVersion, ...extra });
const recipients = () => sendSpy.mock.calls.map((c) => c[0].to).flat().sort();

describe("宛先", () => {
  test("文書を個別に渡されたタスクの担当者に届く。渡されていない人には届かない", async () => {
    const id = await newDoc();
    await assign(a.members[0]!, { documentIds: [id] }, "仕様を読んで実装");
    await assign(a.members[1]!, {}, "別のタスク");
    expect((await save(id, a.leader.cookie)).status).toBe(200);
    expect(recipients()).toEqual([a.members[0]!.email]);
    const mail = sendSpy.mock.calls[0]![0];
    expect(mail.subject).toContain("仕様/chg-");
    expect(mail.text).toContain("leader さんが");
    expect(mail.text).toContain("(版 2)");
    expect(mail.text).toContain("- 仕様を読んで実装");
    expect(mail.text).toContain(`/products/${a.productId}`);
  });

  test("ディレクトリで渡されたタスクの担当者にも届く(あとから足した文書でも)", async () => {
    const dir = (await createDirectory("あとから")).directoryId;
    await assign(a.members[2]!, { directoryIds: [dir] });
    const later = await newDoc(dir);
    await save(later, a.leader.cookie);
    expect(recipients()).toEqual([a.members[2]!.email]);
  });

  test("同じ人に複数のタスクで渡っていても、1 通。その人のタスク名が全部載る", async () => {
    const id = await newDoc();
    await assign(a.members[0]!, { documentIds: [id] }, "タスク A");
    await assign(a.members[0]!, { documentIds: [id] }, "タスク B");
    await save(id, a.leader.cookie);
    expect(sendSpy).toHaveBeenCalledTimes(1);
    const text = sendSpy.mock.calls[0]![0].text;
    expect(text).toContain("- タスク A");
    expect(text).toContain("- タスク B");
  });

  test("複数の担当者には、1 人ずつ別のメールが届く(自分のタスクの名前だけが載る)", async () => {
    const id = await newDoc();
    await assign(a.members[0]!, { documentIds: [id] }, "田中のタスク");
    await assign(a.members[1]!, { documentIds: [id] }, "佐藤のタスク");
    await save(id, a.leader.cookie);
    expect(sendSpy).toHaveBeenCalledTimes(2);
    for (const [call] of sendSpy.mock.calls) {
      const own = call.to === a.members[0]!.email ? "田中のタスク" : "佐藤のタスク";
      const other = own === "田中のタスク" ? "佐藤のタスク" : "田中のタスク";
      expect(call.text).toContain(own);
      expect(call.text).not.toContain(other);
    }
  });

  test("直した本人は除く(自分が担当のタスクでも、自分には送らない)", async () => {
    const id = await newDoc();
    await assign(a.members[0]!, { documentIds: [id] });
    await assign(a.members[1]!, { documentIds: [id] });
    expect((await save(id, a.members[0]!.cookie)).status).toBe(200);
    expect(recipients()).toEqual([a.members[1]!.email]);
  });

  test("完了したタスクの担当者には送らない", async () => {
    const id = await newDoc();
    const done = await assign(a.members[0]!, { documentIds: [id] }, "終わったタスク");
    await db.update(tasks).set({ status: "completed", completedAt: new Date() }).where(eq(tasks.taskId, done));
    await assign(a.members[1]!, { documentIds: [id] });
    await save(id, a.leader.cookie);
    expect(recipients()).toEqual([a.members[1]!.email]);
  });

  test("渡されているタスクがなければ、送らない", async () => {
    const id = await newDoc();
    expect((await save(id, a.leader.cookie)).status).toBe(200);
    expect(sendSpy).not.toHaveBeenCalled();
  });
});

describe("送る・送らない", () => {
  test("notify: false なら、送らない(誤字の直しなど)。省略と true は送る", async () => {
    const id = await newDoc();
    await assign(a.members[0]!, { documentIds: [id] });
    await save(id, a.leader.cookie, { notify: false });
    expect(sendSpy).not.toHaveBeenCalled();
    await save(id, a.leader.cookie, { notify: true }, 2);
    expect(sendSpy).toHaveBeenCalledTimes(1);
    sendSpy.mockClear();
    await save(id, a.leader.cookie, {}, 3);
    expect(sendSpy).toHaveBeenCalledTimes(1);
  });

  test("保存に失敗したとき(版の衝突、権限なし)は、送らない", async () => {
    const id = await newDoc();
    await assign(a.members[0]!, { documentIds: [id] });
    expect((await save(id, a.leader.cookie, {}, 9)).status).toBe(409);
    const readDir = (await createDirectory("read だけ")).directoryId;
    const readDoc = await newDoc(readDir);
    await assign(a.members[1]!, { documentIds: [readDoc] });
    expect((await save(readDoc, a.members[2]!.cookie)).status).toBe(403);
    expect(sendSpy).not.toHaveBeenCalled();
  });

  test("メールの送信が失敗しても、保存は成功する(ほかの通知と同じ)", async () => {
    const id = await newDoc();
    await assign(a.members[0]!, { documentIds: [id] });
    sendSpy.mockResolvedValueOnce({ ok: false, error: "boom" });
    const res = await save(id, a.leader.cookie);
    expect(res.status).toBe(200);
    expect(((await res.json()) as { currentVersion: number }).currentVersion).toBe(2);
  });

  test("名前の変更・移動・削除・ロックの操作では送らない(内容が変わっていない)", async () => {
    const id = await newDoc();
    await assign(a.members[0]!, { documentIds: [id] });
    await call("POST", `/api/product/${a.productId}/document/${id}/lock`, a.members[1]!.cookie);
    await call("DELETE", `/api/product/${a.productId}/document/${id}/lock`, a.members[1]!.cookie);
    await call("PATCH", `/api/product/${a.productId}/document/${id}`, a.leader.cookie, { name: "renamed.md" });
    await call("DELETE", `/api/product/${a.productId}/document/${id}`, a.leader.cookie);
    expect(sendSpy).not.toHaveBeenCalled();
  });
});
