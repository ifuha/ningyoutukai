import { afterAll, afterEach, beforeEach, describe, expect, spyOn, test } from "bun:test";
import { eq } from "drizzle-orm";
import { Elysia } from "elysia";
import { createDb, db, dbStorage } from "../../src/db";
import { products } from "../../src/db/schema";
import { devStorageRoutes } from "../../src/routes/dev-storage";
import { productRoutes } from "../../src/routes/product";
import { productAvatarRoutes } from "../../src/routes/product-avatar";
import { productManageRoutes } from "../../src/routes/product-manage";
import { createMemoryStorage, setDefaultStorage, type ObjectStorage } from "../../src/lib/storage";
import { cleanup, createOutsider, setupProduct } from "../task/helpers";

const app = devStorageRoutes(new Elysia().use(productRoutes).use(productManageRoutes).use(productAvatarRoutes));

let mem: ReturnType<typeof createMemoryStorage>;
const savedBase = process.env.AVATAR_BASE_URL;
beforeEach(() => {
  delete process.env.AVATAR_BASE_URL;
  mem = createMemoryStorage();
  setDefaultStorage(mem);
});
afterEach(() => {
  setDefaultStorage(undefined);
  if (savedBase === undefined) delete process.env.AVATAR_BASE_URL;
  else process.env.AVATAR_BASE_URL = savedBase;
});
afterAll(cleanup);

// 最小のバイト列(先頭だけ本物)
const PNG = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2, 3];
const JPEG = [0xff, 0xd8, 0xff, 0xe0, 1, 2];
const GIF87 = [...new TextEncoder().encode("GIF87a"), 1, 2];
const GIF89 = [...new TextEncoder().encode("GIF89a"), 1, 2];
const WEBP = [...new TextEncoder().encode("RIFF"), 9, 9, 9, 9, ...new TextEncoder().encode("WEBP"), 1];
const SVG = [...new TextEncoder().encode('<svg xmlns="http://www.w3.org/2000/svg"></svg>')];

const MB = 1_048_576;
/** 先頭が PNG で、全体が size バイトのバイト列 */
const pngOfSize = (size: number) => {
  const bytes = new Uint8Array(size);
  bytes.set(PNG.slice(0, Math.min(PNG.length, size)));
  return bytes;
};

function put(productId: string, cookie: string | undefined, bytes: ArrayLike<number>, opts: { type?: string; name?: string } = {}) {
  const form = new FormData();
  form.set("file", new File([new Uint8Array(bytes)], opts.name ?? "icon", { type: opts.type ?? "application/octet-stream" }));
  return app.handle(
    new Request(`http://localhost/api/product/${productId}/avatar`, {
      method: "PUT",
      headers: cookie ? { cookie } : {},
      body: form,
    })
  );
}
const del = (productId: string, cookie?: string) =>
  app.handle(new Request(`http://localhost/api/product/${productId}/avatar`, { method: "DELETE", headers: cookie ? { cookie } : {} }));
const dbKey = async (productId: string) =>
  (await db.select({ k: products.avatarKey }).from(products).where(eq(products.productId, productId)))[0]?.k ?? null;

describe("PUT /api/product/:productId/avatar", () => {
  test("4 種類の画像を保存できる。種類は先頭のバイト列で決まり、Content-Type を偽っても中身で判定する", async () => {
    const { productId, leader } = await setupProduct({ members: 0 });
    const cases: [string, number[], string, string][] = [
      ["png", PNG, "image/png", "png"],
      ["jpeg", JPEG, "image/jpeg", "jpg"],
      ["gif87a", GIF87, "image/gif", "gif"],
      ["gif89a", GIF89, "image/gif", "gif"],
      ["webp", WEBP, "image/webp", "webp"],
    ];
    for (const [, bytes, contentType, ext] of cases) {
      // 送る Content-Type と拡張子は、わざと違うものにする
      const res = await put(productId, leader.cookie, bytes, { type: "text/plain", name: "evil.svg" });
      expect(res.status).toBe(200);
      const json = (await res.json()) as any;
      const key = await dbKey(productId);
      expect(key).toMatch(new RegExp(`^product-avatars/${productId}/[0-9a-f-]{36}\\.${ext}$`));
      expect(json.avatarUrl).toBe(`/api/_dev-storage/${key}`);
      expect(json).not.toHaveProperty("avatarKey");
      expect(json.role).toBe("leader");
      const stored = await mem.get(key!);
      expect(stored!.contentType).toBe(contentType);
      expect(stored!.cacheControl).toBe("public, max-age=31536000, immutable");
      expect(new Uint8Array(await new Response(stored!.body).arrayBuffer())).toEqual(new Uint8Array(bytes));
    }
    // 差し替えるたびに古いのは消えるので、最後の 1 つだけ残る
    expect(mem.keys()).toHaveLength(1);
  });

  test("SVG・テキスト・短すぎるファイルは 415、空ファイルは 422 で、何も保存されない", async () => {
    const { productId, leader } = await setupProduct({ members: 0 });
    for (const [bytes, type] of [
      [SVG, "image/svg+xml"],
      [SVG, "image/png"],
      [[...new TextEncoder().encode("hello")], "image/png"],
      [[0x89, 0x50], "image/png"],
      [[...new TextEncoder().encode("RIFF"), 1, 2, 3, 4, ...new TextEncoder().encode("WAVE")], "image/webp"],
    ] as [number[], string][]) {
      const res = await put(productId, leader.cookie, bytes, { type });
      expect(res.status).toBe(415);
      expect(typeof ((await res.json()) as any).message).toBe("string");
    }
    expect((await put(productId, leader.cookie, [])).status).toBe(422);
    expect(mem.keys()).toEqual([]);
    expect(await dbKey(productId)).toBeNull();
  });

  test("ちょうど 1MB は通り、1MB + 1 バイトは 413", async () => {
    const { productId, leader } = await setupProduct({ members: 0 });
    expect((await put(productId, leader.cookie, pngOfSize(MB + 1))).status).toBe(413);
    expect(mem.keys()).toEqual([]);
    expect((await put(productId, leader.cookie, pngOfSize(MB))).status).toBe(200);
    expect(mem.keys()).toHaveLength(1);
  });

  test("リーダー以外は 403、非メンバーは 404、未ログインは 401。何も保存されない", async () => {
    const { productId, members } = await setupProduct({ members: 1 });
    const outsider = await createOutsider();
    expect((await put(productId, members[0].cookie, PNG)).status).toBe(403);
    expect((await put(productId, outsider.cookie, PNG)).status).toBe(404);
    expect((await put(productId, undefined, PNG)).status).toBe(401);
    // 大きすぎるファイルでも、権限の判定が先
    expect((await put(productId, members[0].cookie, pngOfSize(MB + 1))).status).toBe(403);
    expect(mem.keys()).toEqual([]);
    expect(await dbKey(productId)).toBeNull();
  });

  test("差し替えで、古いキーが R2 から消えて、新しいキーになる", async () => {
    const { productId, leader } = await setupProduct({ members: 0 });
    await put(productId, leader.cookie, PNG);
    const first = await dbKey(productId);
    const res = await put(productId, leader.cookie, JPEG);
    expect(res.status).toBe(200);
    const second = await dbKey(productId);
    expect(second).not.toBe(first);
    expect(mem.keys()).toEqual([second!]);
    expect(await mem.get(first!)).toBeNull();
  });

  test("古い画像を消せなくても、成功する(警告を出す)", async () => {
    const { productId, leader } = await setupProduct({ members: 0 });
    await put(productId, leader.cookie, PNG);
    const warn = spyOn(console, "warn").mockImplementation(() => {});
    const failingDelete: ObjectStorage = { ...mem, delete: async () => { throw new Error("r2 down"); } };
    setDefaultStorage(failingDelete);
    const res = await put(productId, leader.cookie, GIF89);
    expect(res.status).toBe(200);
    expect(warn).toHaveBeenCalled();
    warn.mockRestore();
    expect(await dbKey(productId)).toMatch(/\.gif$/);
  });

  test("保存に失敗したら 500 で、DB は変わらない", async () => {
    const { productId, leader } = await setupProduct({ members: 0 });
    await put(productId, leader.cookie, PNG);
    const before = await dbKey(productId);
    const error = spyOn(console, "error").mockImplementation(() => {});
    setDefaultStorage({ ...mem, put: async () => { throw new Error("r2 down"); } });
    const res = await put(productId, leader.cookie, JPEG);
    error.mockRestore();
    expect(res.status).toBe(500);
    expect(typeof ((await res.json()) as any).message).toBe("string");
    expect(await dbKey(productId)).toBe(before);
    expect(mem.keys()).toEqual([before!]);
  });

  test("DB の更新に失敗したら、保存した新しい画像を消して 500 を返す", async () => {
    const { productId, leader } = await setupProduct({ members: 0 });
    await put(productId, leader.cookie, PNG);
    const before = await dbKey(productId);
    const error = spyOn(console, "error").mockImplementation(() => {});
    // transaction だけが失敗する db に差し替えて、リクエストを流す
    const real = createDb();
    const broken = new Proxy(real, {
      get: (target, prop) => (prop === "transaction" ? async () => { throw new Error("db down"); } : Reflect.get(target, prop, target)),
    });
    const res = await dbStorage.run(broken, () => put(productId, leader.cookie, JPEG));
    await real.$client.end();
    error.mockRestore();
    expect(res.status).toBe(500);
    expect(await dbKey(productId)).toBe(before);
    expect(mem.keys()).toEqual([before!]);
  });

  test("プロダクトの取得にも avatarUrl が出る。他の応答に avatarKey は出ない", async () => {
    const { productId, leader } = await setupProduct({ members: 0 });
    await put(productId, leader.cookie, PNG);
    const key = await dbKey(productId);
    const get = (await (await app.handle(new Request(`http://localhost/api/product/${productId}`, { headers: { cookie: leader.cookie } }))).json()) as any;
    expect(get.avatarUrl).toBe(`/api/_dev-storage/${key}`);
    const patch = (await (
      await app.handle(
        new Request(`http://localhost/api/product/${productId}`, {
          method: "PATCH",
          headers: { cookie: leader.cookie, "content-type": "application/json" },
          body: JSON.stringify({ productName: "改名" }),
        })
      )
    ).json()) as any;
    expect(patch.avatarUrl).toBe(`/api/_dev-storage/${key}`);
    expect(patch).not.toHaveProperty("avatarKey");
  });
});

describe("DELETE /api/product/:productId/avatar", () => {
  test("アイコンを消す。R2 のオブジェクトも消え、avatarUrl は null。何度呼んでも 200(冪等)", async () => {
    const { productId, leader } = await setupProduct({ members: 0 });
    await put(productId, leader.cookie, PNG);
    expect(mem.keys()).toHaveLength(1);

    for (let i = 0; i < 2; i++) {
      const res = await del(productId, leader.cookie);
      expect(res.status).toBe(200);
      const json = (await res.json()) as any;
      expect(json.avatarUrl).toBeNull();
      expect(json).not.toHaveProperty("avatarKey");
      expect(json.productId).toBe(productId);
    }
    expect(await dbKey(productId)).toBeNull();
    expect(mem.keys()).toEqual([]);
  });

  test("アイコンが一度もなくても 200", async () => {
    const { productId, leader } = await setupProduct({ members: 0 });
    const res = await del(productId, leader.cookie);
    expect(res.status).toBe(200);
    expect(((await res.json()) as any).avatarUrl).toBeNull();
  });

  test("R2 の削除に失敗しても、DB は NULL になって 200(警告を出す)", async () => {
    const { productId, leader } = await setupProduct({ members: 0 });
    await put(productId, leader.cookie, PNG);
    const warn = spyOn(console, "warn").mockImplementation(() => {});
    setDefaultStorage({ ...mem, delete: async () => { throw new Error("r2 down"); } });
    const res = await del(productId, leader.cookie);
    expect(res.status).toBe(200);
    expect(warn).toHaveBeenCalled();
    warn.mockRestore();
    expect(await dbKey(productId)).toBeNull();
  });

  test("リーダー以外は 403、非メンバーは 404、未ログインは 401。消えない", async () => {
    const { productId, leader, members } = await setupProduct({ members: 1 });
    await put(productId, leader.cookie, PNG);
    const outsider = await createOutsider();
    expect((await del(productId, members[0].cookie)).status).toBe(403);
    expect((await del(productId, outsider.cookie)).status).toBe(404);
    expect((await del(productId)).status).toBe(401);
    expect(await dbKey(productId)).not.toBeNull();
    expect(mem.keys()).toHaveLength(1);
  });
});

describe("DELETE /api/product/:productId(プロダクト削除)でアイコンも消える", () => {
  const delProduct = (productId: string, cookie: string) =>
    app.handle(new Request(`http://localhost/api/product/${productId}`, { method: "DELETE", headers: { cookie } }));

  test("プロダクトを削除すると、R2 のアイコンも消える", async () => {
    const { productId, leader } = await setupProduct({ members: 0 });
    await put(productId, leader.cookie, PNG);
    expect(mem.keys()).toHaveLength(1);
    expect((await delProduct(productId, leader.cookie)).status).toBe(204);
    expect(mem.keys()).toEqual([]);
  });

  test("アイコンがなくても削除できる。R2 の削除に失敗しても、削除は成功する", async () => {
    const a = await setupProduct({ members: 0 });
    expect((await delProduct(a.productId, a.leader.cookie)).status).toBe(204);

    const b = await setupProduct({ members: 0 });
    await put(b.productId, b.leader.cookie, PNG);
    const warn = spyOn(console, "warn").mockImplementation(() => {});
    setDefaultStorage({ ...mem, delete: async () => { throw new Error("r2 down"); } });
    expect((await delProduct(b.productId, b.leader.cookie)).status).toBe(204);
    expect(warn).toHaveBeenCalled();
    warn.mockRestore();
    expect(await db.select().from(products).where(eq(products.productId, b.productId))).toHaveLength(0);
  });

  test("削除できなかった(メンバー)ときは、アイコンは残る", async () => {
    const { productId, leader, members } = await setupProduct({ members: 1 });
    await put(productId, leader.cookie, PNG);
    expect((await delProduct(productId, members[0].cookie)).status).toBe(403);
    expect(mem.keys()).toHaveLength(1);
  });
});

describe("GET /api/_dev-storage/*(開発用の配信ルート)", () => {
  const getDev = (path: string) => app.handle(new Request(`http://localhost/api/_dev-storage/${path}`));

  test("保存した画像を、Content-Type と Cache-Control つきで返す。なければ 404", async () => {
    const { productId, leader } = await setupProduct({ members: 0 });
    await put(productId, leader.cookie, PNG);
    const key = (await dbKey(productId))!;
    const res = await getDev(key);
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toBe("image/png");
    expect(res.headers.get("cache-control")).toBe("public, max-age=31536000, immutable");
    expect(new Uint8Array(await res.arrayBuffer())).toEqual(new Uint8Array(PNG));

    expect((await getDev("product-avatars/nothing/x.png")).status).toBe(404);
    expect((await getDev("a/..%2F..%2Fetc/passwd")).status).toBe(404);
    expect((await getDev("a b")).status).toBe(404);
  });
});
