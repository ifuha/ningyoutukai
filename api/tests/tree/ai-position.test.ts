import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { eq } from "drizzle-orm";
import { app } from "../../src/app";
import { db } from "../../src/db";
import { aiTokens } from "../../src/db/schema";
import { createAiToken } from "../../src/lib/ai-token";
import { cleanup, createOutsider, setupProduct } from "../task/helpers";

// AI のカードの位置: リーダーだけが動かせる。位置は初めの置き場所からのずれ。ツリーに返る

type Setup = Awaited<ReturnType<typeof setupProduct>>;
type Ai = { tokenId: string; offsetX: number | null; offsetY: number | null };
let a: Setup;
let tokenId: string;

beforeAll(async () => {
  a = await setupProduct({ members: 1 });
  tokenId = (await createAiToken(a.members[0]!.userId, "メンバーの AI", 30)).row.tokenId;
});
afterAll(async () => {
  await cleanup();
});

const call = (method: string, path: string, cookie: string, body?: unknown) =>
  app.handle(new Request(`http://localhost${path}`, { method, headers: { cookie, "content-type": "application/json" }, body: body === undefined ? undefined : JSON.stringify(body) }));
const url = (id = tokenId) => `/api/product/${a.productId}/ai/${id}/position`;
const myAi = async (cookie: string) => {
  const tree = (await (await call("GET", `/api/product/${a.productId}/tree`, cookie)).json()) as { members: { productMemberId: string; ais: Ai[] }[] };
  return tree.members.find((m) => m.productMemberId === a.members[0]!.memberId)!.ais[0]!;
};

describe("AI のカードの位置", () => {
  test("動かしていなければ null", async () => {
    const ai = await myAi(a.leader.cookie);
    expect(ai.offsetX).toBeNull();
    expect(ai.offsetY).toBeNull();
  });

  test("リーダーが動かすと、ツリーに(誰が見ても)返る。もう一度動かすと更新", async () => {
    expect((await call("PUT", url(), a.leader.cookie, { offsetX: 30, offsetY: -12.5 })).status).toBe(200);
    for (const cookie of [a.leader.cookie, a.members[0]!.cookie]) {
      const ai = await myAi(cookie);
      expect([ai.offsetX, ai.offsetY]).toEqual([30, -12.5]);
    }
    expect((await call("PUT", url(), a.leader.cookie, { offsetX: 1, offsetY: 2 })).status).toBe(200);
    const ai = await myAi(a.leader.cookie);
    expect([ai.offsetX, ai.offsetY]).toEqual([1, 2]);
  });

  test("メンバーは動かせない(403)。持ち主でも", async () => {
    expect((await call("PUT", url(), a.members[0]!.cookie, { offsetX: 5, offsetY: 5 })).status).toBe(403);
    expect((await call("DELETE", url(), a.members[0]!.cookie)).status).toBe(403);
  });

  test("プロダクトの外の人は 404。座標の範囲外・数でない値は 422", async () => {
    const outsider = await createOutsider();
    expect((await call("PUT", url(), outsider.cookie, { offsetX: 1, offsetY: 1 })).status).toBe(404);
    expect((await call("PUT", url(), a.leader.cookie, { offsetX: 1e12, offsetY: 0 })).status).toBe(422);
    expect((await call("PUT", url(), a.leader.cookie, { offsetX: "x", offsetY: 0 })).status).toBe(422);
  });

  test("このプロダクトのメンバーのものでないトークン・取り消したトークンは 404", async () => {
    const outsiderTokenId = (await createAiToken(await createOutsiderUserId(), "外の AI", 30)).row.tokenId;
    expect((await call("PUT", url(outsiderTokenId), a.leader.cookie, { offsetX: 1, offsetY: 1 })).status).toBe(404);
    expect((await call("PUT", url(crypto.randomUUID()), a.leader.cookie, { offsetX: 1, offsetY: 1 })).status).toBe(404);
    const revoked = (await createAiToken(a.members[0]!.userId, "取り消す AI", 30)).row.tokenId;
    await db.update(aiTokens).set({ revokedAt: new Date() }).where(eq(aiTokens.tokenId, revoked));
    expect((await call("PUT", url(revoked), a.leader.cookie, { offsetX: 1, offsetY: 1 })).status).toBe(404);
  });

  test("DELETE で初めの置き場所(null)に戻る", async () => {
    await call("PUT", url(), a.leader.cookie, { offsetX: 9, offsetY: 9 });
    expect((await call("DELETE", url(), a.leader.cookie)).status).toBe(200);
    const ai = await myAi(a.leader.cookie);
    expect([ai.offsetX, ai.offsetY]).toEqual([null, null]);
  });
});

async function createOutsiderUserId(): Promise<string> {
  const other = await setupProduct({ members: 0 });
  return other.leader.userId;
}
