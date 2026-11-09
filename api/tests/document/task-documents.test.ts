import { afterAll, afterEach, beforeAll, describe, expect, spyOn, test } from "bun:test";
import { app } from "../../src/app";
import { mailer } from "../../src/lib/mailer";
import { createMemoryStorage, setDefaultDocumentStorage } from "../../src/lib/storage";
import { cleanup, createOutsider, setupProduct } from "../task/helpers";

// タスクに渡す Markdown: 作成のときに結びつける(ディレクトリで / 文書を個別に)。担当者が取ると、一覧が返る

type Setup = Awaited<ReturnType<typeof setupProduct>>;
let a: Setup; // リーダー + メンバー 2 人
let b: Setup;
let specDir: string;
let guideDir: string;
let specMd: string;
let apiMd: string;
let guideMd: string;
let bDoc: string;
const sendSpy = spyOn(mailer, "send");

beforeAll(async () => {
  setDefaultDocumentStorage(createMemoryStorage());
  sendSpy.mockResolvedValue({ ok: true });
  a = await setupProduct();
  b = await setupProduct({ members: 1 });
  specDir = (await createDirectory(a, "仕様")).directoryId;
  guideDir = (await createDirectory(a, "手順")).directoryId;
  specMd = (await createDoc(a, specDir, "spec.md")).documentId;
  apiMd = (await createDoc(a, specDir, "api.md")).documentId;
  guideMd = (await createDoc(a, guideDir, "guide.md")).documentId;
  const bDir = (await createDirectory(b, "b")).directoryId;
  bDoc = (await createDoc(b, bDir, "b.md")).documentId;
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
async function createDoc(s: Setup, directoryId: string, name: string) {
  const res = await call("POST", `/api/product/${s.productId}/directory/${directoryId}/document`, s.leader.cookie, { name, content: `# ${name}` });
  expect(res.status).toBe(201);
  return (await res.json()) as { documentId: string };
}
type Links = { documents: { documentId: string; name: string; directoryName: string; viaDirectory: boolean }[]; documentIds: string[]; directoryIds: string[] };
async function createTask(extra: Record<string, unknown> = {}, assignee = a.members[0]!, setup = a) {
  const res = await call("POST", `/api/product/${setup.productId}/task`, setup.leader.cookie, { taskName: "渡すタスク", productMemberId: assignee.memberId, ...extra });
  return { res, body: (await res.json()) as { taskId: string; message?: string } };
}
const linksUrl = (taskId: string, setup = a) => `/api/product/${setup.productId}/task/${taskId}/document`;
async function links(taskId: string, cookie = a.members[0]!.cookie, setup = a) {
  const res = await call("GET", linksUrl(taskId, setup), cookie);
  expect(res.status).toBe(200);
  return (await res.json()) as Links;
}

describe("作成のときに結びつける", () => {
  test("結びつけなしなら、一覧は空", async () => {
    const { res, body } = await createTask();
    expect(res.status).toBe(201);
    const l = await links(body.taskId);
    expect(l.documents).toEqual([]);
    expect([l.documentIds, l.directoryIds]).toEqual([[], []]);
  });

  test("文書を個別に渡すと、その文書だけが渡る(viaDirectory は false)", async () => {
    const { body } = await createTask({ documentIds: [specMd] });
    const l = await links(body.taskId);
    expect(l.documents.map((d) => d.name)).toEqual(["spec.md"]);
    expect(l.documents[0]!.viaDirectory).toBe(false);
    expect(l.documents[0]!.directoryName).toBe("仕様");
  });

  test("ディレクトリで渡すと、中の文書すべてが渡る(viaDirectory は true)", async () => {
    const { body } = await createTask({ directoryIds: [specDir] });
    const l = await links(body.taskId);
    expect(l.documents.map((d) => d.name).sort()).toEqual(["api.md", "spec.md"]);
    expect(l.documents.every((d) => d.viaDirectory)).toBe(true);
    expect(l.directoryIds).toEqual([specDir]);
  });

  test("ディレクトリと個別を両方渡すと、重なりは 1 件にまとまり、個別の指定が優先される。並びは、ディレクトリ・名前の順", async () => {
    const { body } = await createTask({ directoryIds: [specDir], documentIds: [specMd, guideMd] });
    const l = await links(body.taskId);
    expect(l.documents.map((d) => `${d.directoryName}/${d.name}`)).toEqual(["仕様/api.md", "仕様/spec.md", "手順/guide.md"]);
    const byName = Object.fromEntries(l.documents.map((d) => [d.name, d.viaDirectory]));
    expect(byName).toEqual({ "api.md": true, "spec.md": false, "guide.md": false });
  });

  test("同じ ID を重ねて渡しても、1 件にまとまる", async () => {
    const { res, body } = await createTask({ documentIds: [specMd, specMd], directoryIds: [guideDir, guideDir] });
    expect(res.status).toBe(201);
    expect((await links(body.taskId)).documents.map((d) => d.name).sort()).toEqual(["guide.md", "spec.md"]);
  });

  test("ディレクトリで渡したあとに足した文書も、渡る(個別に渡した文書は、足しても増えない)", async () => {
    const dir = (await createDirectory(a, "あとから足す")).directoryId;
    const { body } = await createTask({ directoryIds: [dir] });
    expect((await links(body.taskId)).documents).toEqual([]);
    await createDoc(a, dir, "later.md");
    expect((await links(body.taskId)).documents.map((d) => d.name)).toEqual(["later.md"]);
  });

  test("他のプロダクトの文書・ディレクトリ、存在しない ID は 400。タスクも作られない", async () => {
    const before = await call("GET", `/api/product/${a.productId}/task`, a.leader.cookie);
    const countBefore = ((await before.json()) as unknown[]).length;
    for (const extra of [{ documentIds: [bDoc] }, { documentIds: [crypto.randomUUID()] }, { directoryIds: [crypto.randomUUID()] }]) {
      expect((await createTask(extra)).res.status).toBe(400);
    }
    const after = await call("GET", `/api/product/${a.productId}/task`, a.leader.cookie);
    expect(((await after.json()) as unknown[]).length).toBe(countBefore);
  });

  test("21 件以上は 422", async () => {
    const ids = Array.from({ length: 21 }, () => crypto.randomUUID());
    expect((await createTask({ documentIds: ids })).res.status).toBe(422);
  });

  test("担当者への通知メールに、渡された文書の名前が載る(中身は載せない)", async () => {
    await createTask({ directoryIds: [specDir], documentIds: [guideMd] });
    expect(sendSpy).toHaveBeenCalledTimes(1);
    const text = sendSpy.mock.calls[0]![0].text;
    expect(text).toContain("渡された文書:");
    expect(text).toContain("- 仕様/spec.md");
    expect(text).toContain("- 手順/guide.md");
    expect(text).not.toContain("# spec.md");
  });

  test("渡す文書がなければ、メールに「渡された文書」の欄は出ない", async () => {
    await createTask();
    expect(sendSpy.mock.calls[0]![0].text).not.toContain("渡された文書");
  });
});

describe("見られる人", () => {
  test("担当者も、他のメンバーも(公開のタスクなら)、リーダーも見られる", async () => {
    const { body } = await createTask({ documentIds: [specMd] });
    for (const cookie of [a.members[0]!.cookie, a.members[1]!.cookie, a.leader.cookie]) {
      expect((await links(body.taskId, cookie)).documents.length).toBe(1);
    }
  });
  test("非表示のタスクは、担当者とリーダー以外には 404(存在を漏らさない)", async () => {
    const { body } = await createTask({ documentIds: [specMd], isVisible: false });
    expect((await call("GET", linksUrl(body.taskId), a.members[1]!.cookie)).status).toBe(404);
    expect((await call("GET", linksUrl(body.taskId), a.members[0]!.cookie)).status).toBe(200);
    expect((await call("GET", linksUrl(body.taskId), a.leader.cookie)).status).toBe(200);
  });
  test("参加者でなければ 404。他のプロダクトの URL でも 404", async () => {
    const { body } = await createTask({ documentIds: [specMd] });
    const outsider = await createOutsider();
    expect((await call("GET", linksUrl(body.taskId), outsider.cookie)).status).toBe(404);
    expect((await call("GET", linksUrl(body.taskId, b), b.leader.cookie)).status).toBe(404);
  });
});

describe("あとから置き換える(リーダーだけ)", () => {
  test("リーダーは置き換えられる。空の配列で、結びつけなし", async () => {
    const { body } = await createTask({ documentIds: [specMd] });
    const res = await call("PUT", linksUrl(body.taskId), a.leader.cookie, { documentIds: [guideMd], directoryIds: [specDir] });
    expect(res.status).toBe(200);
    const l = (await res.json()) as Links;
    expect(l.documents.map((d) => d.name).sort()).toEqual(["api.md", "guide.md", "spec.md"]);
    expect((await call("PUT", linksUrl(body.taskId), a.leader.cookie, { documentIds: [], directoryIds: [] })).status).toBe(200);
    expect((await links(body.taskId)).documents).toEqual([]);
  });
  test("メンバー(担当者でも)は 403。他のプロダクトの文書は 400。存在しないタスクは 404", async () => {
    const { body } = await createTask();
    expect((await call("PUT", linksUrl(body.taskId), a.members[0]!.cookie, { documentIds: [], directoryIds: [] })).status).toBe(403);
    expect((await call("PUT", linksUrl(body.taskId), a.leader.cookie, { documentIds: [bDoc], directoryIds: [] })).status).toBe(400);
    expect((await call("PUT", linksUrl(crypto.randomUUID()), a.leader.cookie, { documentIds: [], directoryIds: [] })).status).toBe(404);
  });
  test("失敗した置き換えは、いまの結びつけを変えない", async () => {
    const { body } = await createTask({ documentIds: [specMd] });
    await call("PUT", linksUrl(body.taskId), a.leader.cookie, { documentIds: [bDoc], directoryIds: [] });
    expect((await links(body.taskId)).documentIds).toEqual([specMd]);
  });
});

describe("文書が消えたとき", () => {
  test("文書を消すと、渡る一覧からも消える(タスクは残る)", async () => {
    const doc = (await createDoc(a, guideDir, "short-lived.md")).documentId;
    const { body } = await createTask({ documentIds: [doc] });
    expect((await links(body.taskId)).documents.length).toBe(1);
    expect((await call("DELETE", `/api/product/${a.productId}/document/${doc}`, a.leader.cookie)).status).toBe(204);
    expect((await links(body.taskId)).documents).toEqual([]);
    expect((await call("GET", `/api/product/${a.productId}/task/${body.taskId}`, a.leader.cookie)).status).toBe(200);
  });
});
