import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { eq } from "drizzle-orm";
import { app } from "../../src/app";
import { db } from "../../src/db";
import { products } from "../../src/db/schema";
import { cleanup, setupProduct } from "../task/helpers";

// products.avatar_key(プロダクトのアイコンの、R2 のキー)。NULL 可。応答には、キーそのものを出さない

type Setup = Awaited<ReturnType<typeof setupProduct>>;
let p: Setup;

beforeAll(async () => {
  p = await setupProduct();
});
afterAll(cleanup);

const call = (method: string, path: string, cookie: string, body?: unknown) =>
  app.handle(
    new Request(`http://localhost${path}`, {
      method,
      headers: { cookie, ...(body === undefined ? {} : { "content-type": "application/json" }) },
      body: body === undefined ? undefined : JSON.stringify(body),
    }),
  );

describe("products.avatar_key", () => {
  test("新しいプロダクトの avatar_key は NULL(アイコンなし)", async () => {
    const [row] = await db.select().from(products).where(eq(products.productId, p.productId));
    expect(row!.avatarKey).toBeNull();
  });

  test("avatar_key に値があっても、プロダクト作成の応答に、キーは出ない", async () => {
    const res = await call("POST", "/api/product", p.leader.cookie, { productName: "アイコン確認" });
    expect(res.status).toBe(201);
    const body = (await res.json()) as Record<string, unknown>;
    expect(body).not.toHaveProperty("avatarKey");
    expect(body).not.toHaveProperty("avatar_key");
    await db.delete(products).where(eq(products.productId, body.productId as string));
  });

  test("avatar_key に値があっても、プロダクト情報の変更(PATCH)の応答に、キーは出ない。保存済みのキーは消えない", async () => {
    await db.update(products).set({ avatarKey: "product-avatars/x/abc.png" }).where(eq(products.productId, p.productId));
    const res = await call("PATCH", `/api/product/${p.productId}`, p.leader.cookie, { productName: "改名" });
    expect(res.status).toBe(200);
    const body = (await res.json()) as Record<string, unknown>;
    expect(body.productName).toBe("改名");
    expect(body).not.toHaveProperty("avatarKey");
    const [row] = await db.select().from(products).where(eq(products.productId, p.productId));
    expect(row!.avatarKey).toBe("product-avatars/x/abc.png");
  });
});
