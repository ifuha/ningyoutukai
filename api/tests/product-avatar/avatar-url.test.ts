import { afterAll, afterEach, describe, expect, test } from "bun:test";
import { eq } from "drizzle-orm";
import { Elysia } from "elysia";
import { db } from "../../src/db";
import { products } from "../../src/db/schema";
import { avatarUrlOf } from "../../src/lib/avatar";
import { productRoutes } from "../../src/routes/product";
import { productTreeRoutes } from "../../src/routes/product-tree";
import { cleanup, setupProduct } from "../task/helpers";

const app = new Elysia().use(productRoutes).use(productTreeRoutes);
const BASE = process.env.AVATAR_BASE_URL;

afterEach(() => {
  if (BASE === undefined) delete process.env.AVATAR_BASE_URL;
  else process.env.AVATAR_BASE_URL = BASE;
});
afterAll(cleanup);

const get = (path: string, cookie: string) =>
  app.handle(new Request(`http://localhost${path}`, { headers: { cookie } }));

describe("avatarUrlOf(キーを URL にする)", () => {
  test("キーがなければ null", () => {
    expect(avatarUrlOf(null)).toBeNull();
    expect(avatarUrlOf(undefined)).toBeNull();
    expect(avatarUrlOf("")).toBeNull();
  });
  test("AVATAR_BASE_URL が未設定なら、開発用の配信ルートのパスにする", () => {
    delete process.env.AVATAR_BASE_URL;
    expect(avatarUrlOf("product-avatars/p/a.png")).toBe("/api/_dev-storage/product-avatars/p/a.png");
  });
  test("AVATAR_BASE_URL があれば、それにキーをつなぐ。末尾の / はあってもなくても同じ", () => {
    process.env.AVATAR_BASE_URL = "https://img.example.com";
    expect(avatarUrlOf("k/a.png")).toBe("https://img.example.com/k/a.png");
    process.env.AVATAR_BASE_URL = "https://img.example.com/";
    expect(avatarUrlOf("k/a.png")).toBe("https://img.example.com/k/a.png");
  });
  test("空の AVATAR_BASE_URL は、未設定と同じ", () => {
    process.env.AVATAR_BASE_URL = "";
    expect(avatarUrlOf("k/a.png")).toBe("/api/_dev-storage/k/a.png");
  });
});

describe("プロダクトの応答の avatarUrl", () => {
  test("一覧・取得・ツリーに avatarUrl が入る(なければ null、あれば URL)。avatarKey は出ない", async () => {
    delete process.env.AVATAR_BASE_URL;
    const { productId, leader } = await setupProduct({ members: 0 });
    const readers = [
      async () =>
        ((await (await get("/api/product/", leader.cookie)).json()) as any[]).find((p) => p.productId === productId),
      async () => await (await get(`/api/product/${productId}`, leader.cookie)).json(),
      async () => ((await (await get(`/api/product/${productId}/tree`, leader.cookie)).json()) as any).product,
    ];
    for (const read of readers) expect((await read()).avatarUrl).toBeNull();

    await db
      .update(products)
      .set({ avatarKey: `product-avatars/${productId}/x.png` })
      .where(eq(products.productId, productId));
    for (const read of readers) {
      const p = await read();
      expect(p.avatarUrl).toBe(`/api/_dev-storage/product-avatars/${productId}/x.png`);
      expect(p).not.toHaveProperty("avatarKey");
    }
  });
});
