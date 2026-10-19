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
    // 型上必須の第 2 引数(validateUserInfo 未設定のため実質使われない)
  }, { method: "email-password" });
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
    // セッション・アカウントは deleteUser が一緒に削除する
    await internalAdapter.deleteUser(id);
  }
});

describe("GET /api/auth/get-session", () => {
  test("cookie なしなら 200 で null", async () => {
    const res = await getSession();
    expect(res.status).toBe(200);
    expect(await res.json()).toBeNull();
  });

  test("有効なセッション cookie ならユーザー情報とセッション情報を返す", async () => {
    const user = await createTestUser();
    const session = await createTestSession(user.id);

    const res = await getSession(await sessionCookie(session.token));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.user.id).toBe(user.id);
    expect(body.user.email).toBe(user.email);
    expect(body.user.name).toBe(user.name);
    expect(body.session.id).toBe(session.id);
    expect(body.session.userId).toBe(user.id);
    expect(body.session.token).toBe(session.token);
    expect(new Date(body.session.expiresAt).getTime()).toBeGreaterThan(Date.now());
  });

  test("期限切れのセッションなら null", async () => {
    const user = await createTestUser();
    const session = await createTestSession(user.id, new Date(Date.now() - 60_000));

    const res = await getSession(await sessionCookie(session.token));
    expect(res.status).toBe(200);
    expect(await res.json()).toBeNull();
  });

  test("DB に存在しないトークンなら null", async () => {
    // 正しく署名されていても、対応するセッションが DB になければ無効
    const res = await getSession(await sessionCookie(`nonexistent-${crypto.randomUUID()}`));
    expect(res.status).toBe(200);
    expect(await res.json()).toBeNull();
  });

  test("DB から削除済みのセッションなら null", async () => {
    const user = await createTestUser();
    const session = await createTestSession(user.id);
    const cookie = await sessionCookie(session.token);

    // 削除前は取得できる
    const before = await getSession(cookie);
    expect((await before.json()).session.id).toBe(session.id);

    await (await ctx()).internalAdapter.deleteSession(session.token);

    const res = await getSession(cookie);
    expect(res.status).toBe(200);
    expect(await res.json()).toBeNull();
  });

  describe("署名が不正な cookie", () => {
    test("署名部分を改ざんすると null", async () => {
      const user = await createTestUser();
      const session = await createTestSession(user.id);
      const cookie = await sessionCookie(session.token);
      // 末尾の 1 文字を別の文字に差し替える(値は "token.署名" を URL エンコードした形)
      const tampered = cookie.slice(0, -1) + (cookie.endsWith("A") ? "B" : "A");

      const res = await getSession(tampered);
      expect(res.status).toBe(200);
      expect(await res.json()).toBeNull();
    });

    test("署名なし(トークンのみ)の cookie は null", async () => {
      const user = await createTestUser();
      const session = await createTestSession(user.id);
      const name = (await ctx()).authCookies.sessionToken.name;

      const res = await getSession(`${name}=${session.token}`);
      expect(res.status).toBe(200);
      expect(await res.json()).toBeNull();
    });

    test("別のシークレットで署名した cookie は null", async () => {
      const user = await createTestUser();
      const session = await createTestSession(user.id);
      const name = (await ctx()).authCookies.sessionToken.name;
      const forged = (
        await serializeSignedCookie(name, session.token, "wrong-secret")
      ).split(";")[0]!;

      const res = await getSession(forged);
      expect(res.status).toBe(200);
      expect(await res.json()).toBeNull();
    });
  });
});
