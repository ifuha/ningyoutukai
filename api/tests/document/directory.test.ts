import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { app } from "../../src/app";
import { createMemoryStorage, setDefaultDocumentStorage } from "../../src/lib/storage";
import { cleanup, createOutsider, setupProduct } from "../task/helpers";

// ディレクトリと、ディレクトリごとの権限

type Setup = Awaited<ReturnType<typeof setupProduct>>;
let a: Setup; // リーダー + メンバー 2 人
let b: Setup; // 別のプロダクト

beforeAll(async () => {
  setDefaultDocumentStorage(createMemoryStorage());
  a = await setupProduct();
  b = await setupProduct({ members: 1 });
});
afterAll(async () => {
  setDefaultDocumentStorage(undefined);
  await cleanup();
});

const base = (productId: string) => `/api/product/${productId}/directory`;
function call(method: string, path: string, cookie?: string, body?: unknown) {
  const headers = new Headers();
  if (cookie) headers.set("cookie", cookie);
  if (body !== undefined) headers.set("content-type", "application/json");
  return app.handle(new Request(`http://localhost${path}`, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) }));
}
type Directory = { directoryId: string; name: string; myLevel: string; documents: { documentId: string; name: string }[] };
async function createDirectory(setup: Setup, name: string) {
  const res = await call("POST", base(setup.productId), setup.leader.cookie, { name });
  expect(res.status).toBe(201);
  return (await res.json()) as Directory;
}

describe("作成", () => {
  test("リーダーは作れる。myLevel は write、文書は空", async () => {
    const res = await call("POST", base(a.productId), a.leader.cookie, { name: "仕様" });
    expect(res.status).toBe(201);
    const body = (await res.json()) as Directory;
    expect(body.name).toBe("仕様");
    expect(body.myLevel).toBe("write");
    expect(body.documents).toEqual([]);
  });
  test("メンバーは作れない(403)。参加者でなければ 404。ログインしていなければ 401", async () => {
    expect((await call("POST", base(a.productId), a.members[0]!.cookie, { name: "x" })).status).toBe(403);
    const outsider = await createOutsider();
    expect((await call("POST", base(a.productId), outsider.cookie, { name: "x" })).status).toBe(404);
    expect((await call("POST", base(a.productId), undefined, { name: "x" })).status).toBe(401);
  });
  test("同じプロダクトで同じ名前は 409。別のプロダクトなら作れる", async () => {
    await createDirectory(a, "重複");
    expect((await call("POST", base(a.productId), a.leader.cookie, { name: "重複" })).status).toBe(409);
    expect((await call("POST", base(b.productId), b.leader.cookie, { name: "重複" })).status).toBe(201);
  });
  test("名前は 1〜100 文字。/ や \\ を含む名前、前後に空白がある名前は 422", async () => {
    for (const name of ["", "あ".repeat(101), "a/b", "a\\b", " 先頭に空白", "末尾に空白 "]) {
      expect((await call("POST", base(a.productId), a.leader.cookie, { name })).status).toBe(422);
    }
    expect((await call("POST", base(a.productId), a.leader.cookie, { name: "あ".repeat(100) })).status).toBe(201);
  });
});

describe("一覧", () => {
  test("参加者全員が見られる。リーダーは write、メンバーは何も設定がなければ read。write を渡されたディレクトリは write", async () => {
    const dir = await createDirectory(a, "一覧の権限");
    const m = a.members[0]!;
    const asLeader = (await (await call("GET", base(a.productId), a.leader.cookie)).json()) as Directory[];
    expect(asLeader.find((d) => d.directoryId === dir.directoryId)?.myLevel).toBe("write");
    const asMember = (await (await call("GET", base(a.productId), m.cookie)).json()) as Directory[];
    expect(asMember.find((d) => d.directoryId === dir.directoryId)?.myLevel).toBe("read");
    await call("PUT", `${base(a.productId)}/${dir.directoryId}/permission/${m.memberId}`, a.leader.cookie, { level: "write" });
    const after = (await (await call("GET", base(a.productId), m.cookie)).json()) as Directory[];
    expect(after.find((d) => d.directoryId === dir.directoryId)?.myLevel).toBe("write");
    // 別のメンバーには効かない
    const other = (await (await call("GET", base(a.productId), a.members[1]!.cookie)).json()) as Directory[];
    expect(other.find((d) => d.directoryId === dir.directoryId)?.myLevel).toBe("read");
  });
  test("別のプロダクトのディレクトリは出ない。参加者でなければ 404", async () => {
    const dir = await createDirectory(b, "b だけ");
    const list = (await (await call("GET", base(a.productId), a.leader.cookie)).json()) as Directory[];
    expect(list.map((d) => d.directoryId)).not.toContain(dir.directoryId);
    const outsider = await createOutsider();
    expect((await call("GET", base(a.productId), outsider.cookie)).status).toBe(404);
  });
});

describe("名前の変更・削除", () => {
  test("リーダーは名前を変えられる。メンバーは 403。重複は 409", async () => {
    const dir = await createDirectory(a, "変更前");
    await createDirectory(a, "変更先がある");
    const url = `${base(a.productId)}/${dir.directoryId}`;
    expect((await call("PATCH", url, a.members[0]!.cookie, { name: "x" })).status).toBe(403);
    expect((await call("PATCH", url, a.leader.cookie, { name: "変更先がある" })).status).toBe(409);
    const res = await call("PATCH", url, a.leader.cookie, { name: "変更後" });
    expect(res.status).toBe(200);
    expect(((await res.json()) as Directory).name).toBe("変更後");
  });
  test("空のディレクトリは、リーダーが消せる。メンバーは 403。他のプロダクトのディレクトリは 404", async () => {
    const dir = await createDirectory(a, "消す");
    const url = `${base(a.productId)}/${dir.directoryId}`;
    expect((await call("DELETE", url, a.members[0]!.cookie)).status).toBe(403);
    expect((await call("DELETE", `${base(b.productId)}/${dir.directoryId}`, b.leader.cookie)).status).toBe(404);
    expect((await call("DELETE", url, a.leader.cookie)).status).toBe(204);
    expect((await call("DELETE", url, a.leader.cookie)).status).toBe(404);
  });
  test("文書が入っているディレクトリは消せない(409)。文書を消すと消せる", async () => {
    const dir = await createDirectory(a, "中身あり");
    const created = await call("POST", `${base(a.productId)}/${dir.directoryId}/document`, a.leader.cookie, { name: "a.md", content: "# a" });
    expect(created.status).toBe(201);
    const documentId = ((await created.json()) as { documentId: string }).documentId;
    expect((await call("DELETE", `${base(a.productId)}/${dir.directoryId}`, a.leader.cookie)).status).toBe(409);
    expect((await call("DELETE", `/api/product/${a.productId}/document/${documentId}`, a.leader.cookie)).status).toBe(204);
    expect((await call("DELETE", `${base(a.productId)}/${dir.directoryId}`, a.leader.cookie)).status).toBe(204);
  });
});

describe("権限の設定", () => {
  type Row = { memberId: string; userName: string; level: string };
  test("一覧は、リーダー以外の全メンバーが出る(設定がなければ read)。リーダー自身は出ない", async () => {
    const dir = await createDirectory(a, "権限の一覧");
    const res = await call("GET", `${base(a.productId)}/${dir.directoryId}/permission`, a.leader.cookie);
    expect(res.status).toBe(200);
    const rows = (await res.json()) as Row[];
    expect(rows.map((r) => r.memberId).sort()).toEqual(a.members.map((m) => m.memberId).sort());
    expect(rows.every((r) => r.level === "read")).toBe(true);
  });
  test("write にすると write、read に戻すと read(行は消える)", async () => {
    const dir = await createDirectory(a, "権限の切り替え");
    const m = a.members[1]!;
    const url = `${base(a.productId)}/${dir.directoryId}/permission/${m.memberId}`;
    expect((await call("PUT", url, a.leader.cookie, { level: "write" })).status).toBe(200);
    // 二重に設定しても、エラーにならない
    expect((await call("PUT", url, a.leader.cookie, { level: "write" })).status).toBe(200);
    const list = async () => ((await (await call("GET", `${base(a.productId)}/${dir.directoryId}/permission`, a.leader.cookie)).json()) as Row[]).find((r) => r.memberId === m.memberId)?.level;
    expect(await list()).toBe("write");
    expect((await call("PUT", url, a.leader.cookie, { level: "read" })).status).toBe(200);
    expect(await list()).toBe("read");
  });
  test("設定できるのはリーダーだけ。メンバーは(write があっても)403、一覧も見られない", async () => {
    const dir = await createDirectory(a, "権限はリーダーだけ");
    const m = a.members[0]!;
    const url = `${base(a.productId)}/${dir.directoryId}/permission/${m.memberId}`;
    await call("PUT", url, a.leader.cookie, { level: "write" });
    expect((await call("PUT", url, m.cookie, { level: "write" })).status).toBe(403);
    expect((await call("GET", `${base(a.productId)}/${dir.directoryId}/permission`, m.cookie)).status).toBe(403);
  });
  test("リーダー自身には設定できない(422)。別のプロダクトのメンバーは 404。不正な値は 422", async () => {
    const dir = await createDirectory(a, "権限の異常系");
    const url = (memberId: string) => `${base(a.productId)}/${dir.directoryId}/permission/${memberId}`;
    expect((await call("PUT", url(a.leader.memberId), a.leader.cookie, { level: "write" })).status).toBe(422);
    expect((await call("PUT", url(b.members[0]!.memberId), a.leader.cookie, { level: "write" })).status).toBe(404);
    expect((await call("PUT", url(a.members[0]!.memberId), a.leader.cookie, { level: "admin" })).status).toBe(422);
  });
});
