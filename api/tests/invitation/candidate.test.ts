import { afterAll, beforeAll, describe, expect, it } from "bun:test";
import { eq } from "drizzle-orm";
import { Elysia } from "elysia";
import { db } from "../../src/db";
import { users } from "../../src/db/schema";
import { invitationRoutes } from "../../src/routes/invitation";
import { cleanup, createOutsider, setupProduct } from "../task/helpers";

const app = new Elysia().use(invitationRoutes);

type Candidate = {
  userId: string;
  userName: string;
  githubId: string | null;
  email: string | null;
};

function candidates(productId: string, q: string, cookie?: string) {
  const headers = new Headers();
  if (cookie) headers.set("cookie", cookie);
  return app.handle(
    new Request(
      `http://localhost/api/product/${productId}/invitation/candidate?q=${encodeURIComponent(q)}`,
      { headers }
    )
  );
}

let p: Awaited<ReturnType<typeof setupProduct>>;
beforeAll(async () => {
  p = await setupProduct({ members: 1 });
});
afterAll(cleanup);

/** 登録済み(users の行あり)の別ユーザーを作る */
async function createRegistered(githubId?: string) {
  const o = await createOutsider();
  await app.handle(new Request("http://localhost/api/invitation", { headers: { cookie: o.cookie } }));
  if (githubId) await db.update(users).set({ githubId }).where(eq(users.email, o.email));
  const [row] = await db.select().from(users).where(eq(users.email, o.email));
  return { ...o, userId: row!.userId };
}

describe("招待の候補 GET /api/product/:productId/invitation/candidate", () => {
  it("cookie なしは 401", async () => {
    expect((await candidates(p.productId, "a")).status).toBe(401);
  });
  it("所属していない人は 404、メンバーは 403", async () => {
    const o = await createOutsider();
    expect((await candidates(p.productId, "a", o.cookie)).status).toBe(404);
    expect((await candidates(p.productId, "a", p.members[0]!.cookie)).status).toBe(403);
  });
  it("空の入力は空の配列", async () => {
    const res = await candidates(p.productId, "  @ ", p.leader.cookie);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual([]);
  });
  it("GitHub の username で見つかる(先頭の @ は無視・大文字小文字は区別しない)。メールは返さない", async () => {
    const tag = `cand${crypto.randomUUID().slice(0, 8)}`;
    const u = await createRegistered(`Gh-${tag}`);
    const res = await candidates(p.productId, `@GH-${tag.toUpperCase()}`, p.leader.cookie);
    const list = (await res.json()) as Candidate[];
    const hit = list.find((c) => c.userId === u.userId);
    expect(hit?.githubId).toBe(`Gh-${tag}`);
    expect(hit?.email).toBeNull();
  });
  it("GitHub の username を持たない人は、メールで見つかり、メールも返す", async () => {
    const u = await createRegistered();
    const res = await candidates(p.productId, u.email.slice(0, 20), p.leader.cookie);
    const hit = ((await res.json()) as Candidate[]).find((c) => c.userId === u.userId);
    expect(hit?.email).toBe(u.email);
  });
  it("すでにメンバーの人と自分は出ない", async () => {
    const [leader] = await db.select().from(users).where(eq(users.userId, p.leader.userId));
    const res = await candidates(p.productId, leader!.email, p.leader.cookie);
    expect(await res.json()).toEqual([]);
  });
  it("% と _ は、ただの文字として扱う", async () => {
    await createRegistered();
    expect(await (await candidates(p.productId, "%", p.leader.cookie)).json()).toEqual([]);
  });
  it("最大 8 件", async () => {
    const res = await candidates(p.productId, "task-test-", p.leader.cookie);
    expect(((await res.json()) as Candidate[]).length).toBeLessThanOrEqual(8);
  });
});
