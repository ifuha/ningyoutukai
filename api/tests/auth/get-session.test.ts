import { afterAll, describe, expect, test } from "bun:test";
import { serializeSignedCookie } from "better-call";
import { auth } from "../../src/auth";

const ENDPOINT = "http://localhost:3001/api/auth/get-session";

const createdUserIds: string[] = [];

async function ctx() {
  return await auth.$context;
}

// テスト用ユーザーを DB に直接作成する(パスワード認証には依存しない)
async function createTestUser() {
  const { internalAdapter } = await ctx();
  const unique = `${Date.now()}-${crypto.randomUUID()}`;
  const user = await internalAdapter.createUser({
    email: `get-session-test-${unique}@example.com`,
    name: `get-session-test-${unique}`,
    emailVerified: true,
  });
  createdUserIds.push(user.id);
  return user;
}

// セッションを DB に直接作成する。expiresAt を過去にすれば期限切れセッションになる
async function createTestSession(userId: string, expiresAt?: Date) {
  const { internalAdapter } = await ctx();
  const session = await internalAdapter.createSession(userId);
  if (expiresAt) {
    await internalAdapter.updateSession(session.token, { expiresAt });
  }
  return session;
}

// better-auth 本体と同じ署名関数でセッション cookie ヘッダ値("name=value")を組み立てる
async function sessionCookie(token: string) {
  const c = await ctx();
  const serialized = await serializeSignedCookie(
    c.authCookies.sessionToken.name,
    token,
    c.secret,
  );
  return serialized.split(";")[0]!;
}

async function getSession(cookie?: string) {
  const headers = new Headers();
  if (cookie) headers.set("cookie", cookie);
  return await auth.handler(new Request(ENDPOINT, { method: "GET", headers }));
}

afterAll(async () => {
  const { internalAdapter } = await ctx();
  for (const id of createdUserIds) {
    await internalAdapter.deleteSessions(id);
    await internalAdapter.deleteUser(id);
  }
});

describe("GET /api/auth/get-session", () => {
  test("cookie なしなら 200 で null", async () => {
    const res = await getSession();
    expect(res.status).toBe(200);
    expect(await res.json()).toBeNull();
  });
});
