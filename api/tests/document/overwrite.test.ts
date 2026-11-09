import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { app } from "../../src/app";
import { createMemoryStorage, setDefaultDocumentStorage } from "../../src/lib/storage";
import { cleanup, setupProduct } from "../task/helpers";

// 保存のしかた: 既定は新しい版。mode: "overwrite" は、いまの版の本文を置き換える(版は増えない)

const docs = createMemoryStorage();
type Setup = Awaited<ReturnType<typeof setupProduct>>;
let a: Setup;
let dirId: string;

beforeAll(async () => {
  setDefaultDocumentStorage(docs);
  a = await setupProduct({ members: 0 });
  dirId = ((await (await call("POST", `/api/product/${a.productId}/directory`, { name: "上書き" })).json()) as { directoryId: string }).directoryId;
});
afterAll(async () => {
  setDefaultDocumentStorage(undefined);
  await cleanup();
});

function call(method: string, path: string, body?: unknown) {
  return app.handle(new Request(`http://localhost${path}`, { method, headers: { cookie: a.leader.cookie, "content-type": "application/json" }, body: body === undefined ? undefined : JSON.stringify(body) }));
}
const create = async (name: string, content: string) =>
  ((await (await call("POST", `/api/product/${a.productId}/directory/${dirId}/document`, { name, content })).json()) as { documentId: string }).documentId;
const read = async (id: string, version?: number) =>
  (await (await call("GET", `/api/product/${a.productId}/document/${id}${version ? `?version=${version}` : ""}`)).json()) as { currentVersion: number; content: string };
const put = (id: string, body: unknown) => call("PUT", `/api/product/${a.productId}/document/${id}`, body);

describe("上書き", () => {
  test("版は増えず、本文が置き換わる", async () => {
    const id = await create("o1.md", "元");
    const res = await put(id, { content: "上書き後", baseVersion: 1, mode: "overwrite" });
    expect(res.status).toBe(200);
    expect(((await res.json()) as { version: number }).version).toBe(1);
    const got = await read(id);
    expect(got.currentVersion).toBe(1);
    expect(got.content).toBe("上書き後");
    const versions = (await (await call("GET", `/api/product/${a.productId}/document/${id}/version`)).json()) as unknown[];
    expect(versions).toHaveLength(1);
  });

  test("新しい版として残す(mode 省略 / new)と前の版が残る。上書きは、最新の版だけを置き換える", async () => {
    const id = await create("o2.md", "v1");
    await put(id, { content: "v2", baseVersion: 1 });
    await put(id, { content: "v3", baseVersion: 2, mode: "new" });
    const res = await put(id, { content: "v3 直し", baseVersion: 3, mode: "overwrite" });
    expect(res.status).toBe(200);
    expect((await read(id)).content).toBe("v3 直し");
    expect((await read(id, 1)).content).toBe("v1");
    expect((await read(id, 2)).content).toBe("v2");
    expect((await read(id)).currentVersion).toBe(3);
  });

  test("開いたときの版が古ければ、上書きでも 409。本文は変わらない", async () => {
    const id = await create("o3.md", "a");
    await put(id, { content: "b", baseVersion: 1 });
    const res = await put(id, { content: "c", baseVersion: 1, mode: "overwrite" });
    expect(res.status).toBe(409);
    expect((await read(id)).content).toBe("b");
  });

  test("不正な mode は 422", async () => {
    const id = await create("o4.md", "a");
    expect((await put(id, { content: "b", baseVersion: 1, mode: "x" })).status).toBe(422);
  });
});
