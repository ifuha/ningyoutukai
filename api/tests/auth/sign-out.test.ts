import { afterAll, afterEach, describe, expect, test } from "bun:test";
import { eq } from "drizzle-orm";
import { serializeSignedCookie } from "better-call";
import { auth, webOrigin } from "../../src/auth";
import { db } from "../../src/db";
import { session as sessionTable, user as userTable } from "../../src/db/auth-schema";

const BASE_URL = process.env.BETTER_AUTH_URL ?? "http://localhost:3001";
const SESSION_COOKIE = "better-auth.session_token";

const createdUserIds: string[] = [];

/** テスト用ユーザーを DB に直接作成する(パスワード認証には依存しない) */
async function createTestUser() {
  const ctx = await auth.$context;
  const unique = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  const user = await ctx.internalAdapter.createUser(
    {
      email: `sign-out-test-${unique}@example.com`,
      name: "sign-out test",
      emailVerified: true,
    },
    { method: "admin" },
  );
  createdUserIds.push(user.id);
  return user;
}

/** セッションを DB に作成し、署名付きセッション cookie ヘッダ値を返す */
async function createSessionFor(userId: string) {
  const ctx = await auth.$context;
  const session = await ctx.internalAdapter.createSession(userId);
  // serializeSignedCookie は "name=<encode(value.signature)>; ..." を返すので先頭の組だけ使う
  const serialized = await serializeSignedCookie(
    SESSION_COOKIE,
    session.token,
    ctx.secret,
  );
  const cookie = serialized.split(";")[0]!;
  return { session, cookie };
}

function request(path: string, init: { method?: string; cookie?: string } = {}) {
  const headers: Record<string, string> = { origin: webOrigin };
  if (init.cookie) headers.cookie = init.cookie;
  if (init.method === "POST") headers["content-type"] = "application/json";
  return auth.handler(
    new Request(`${BASE_URL}/api/auth${path}`, {
      method: init.method ?? "GET",
      headers,
      body: init.method === "POST" ? "{}" : undefined,
    }),
  );
}

const signOut = (cookie?: string) => request("/sign-out", { method: "POST", cookie });
const getSession = (cookie?: string) => request("/get-session", { cookie });

async function cleanup() {
  for (const id of createdUserIds.splice(0)) {
    await db.delete(sessionTable).where(eq(sessionTable.userId, id));
    await db.delete(userTable).where(eq(userTable.id, id));
  }
}

afterEach(cleanup);
afterAll(cleanup);

describe("POST /api/auth/sign-out", () => {
  test("有効なセッション cookie で 200 と success: true を返す", async () => {
    const user = await createTestUser();
    const { cookie } = await createSessionFor(user.id);
    const res = await signOut(cookie);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ success: true });
  });

  test("sign-out 後に session テーブルの該当行が削除される", async () => {
    const user = await createTestUser();
    const { session, cookie } = await createSessionFor(user.id);
    const before = await db.select().from(sessionTable).where(eq(sessionTable.id, session.id));
    expect(before).toHaveLength(1);

    await signOut(cookie);

    const after = await db.select().from(sessionTable).where(eq(sessionTable.id, session.id));
    expect(after).toHaveLength(0);
  });

  test("Set-Cookie でセッション cookie が無効化される", async () => {
    const user = await createTestUser();
    const { cookie } = await createSessionFor(user.id);
    const res = await signOut(cookie);

    const setCookies = res.headers.getSetCookie();
    const sessionCookie = setCookies.find((c) => c.includes(`${SESSION_COOKIE}=`));
    expect(sessionCookie).toBeDefined();
    expect(sessionCookie).toMatch(new RegExp(`${SESSION_COOKIE}=;`));
    expect(sessionCookie).toMatch(/Max-Age=0/i);
  });

  test("sign-out 後に同じ cookie で get-session を呼ぶと null", async () => {
    const user = await createTestUser();
    const { cookie } = await createSessionFor(user.id);
    expect(await (await getSession(cookie)).json()).not.toBeNull();

    await signOut(cookie);

    const res = await getSession(cookie);
    expect(res.status).toBe(200);
    expect(await res.json()).toBeNull();
  });

  test("cookie なしでもエラーにならず 200 / success: true で cookie を無効化する", async () => {
    const res = await signOut();
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ success: true });
    const sessionCookie = res.headers
      .getSetCookie()
      .find((c) => c.includes(`${SESSION_COOKIE}=`));
    expect(sessionCookie).toMatch(/Max-Age=0/i);
  });

  test("同一ユーザーの別セッションは削除されない", async () => {
    const user = await createTestUser();
    const a = await createSessionFor(user.id);
    const b = await createSessionFor(user.id);

    await signOut(a.cookie);

    const rows = await db.select().from(sessionTable).where(eq(sessionTable.userId, user.id));
    expect(rows.map((r) => r.id)).toEqual([b.session.id]);

    const res = await getSession(b.cookie);
    const body = (await res.json()) as { session: { id: string } } | null;
    expect(body?.session.id).toBe(b.session.id);
  });

  test("ヘルパーでログイン済み状態を作れる", async () => {
    const user = await createTestUser();
    const { cookie } = await createSessionFor(user.id);
    const res = await getSession(cookie);
    const body = (await res.json()) as { user: { id: string } } | null;
    expect(body?.user.id).toBe(user.id);
  });
});
