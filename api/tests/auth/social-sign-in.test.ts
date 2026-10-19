import { afterAll, beforeAll, describe, expect, test } from "bun:test";

// ---- 土台: 環境変数は auth を import する前に設定する(実際の OAuth 通信は行わない) ----
process.env.GITHUB_CLIENT_ID = "test-github-client-id";
process.env.GITHUB_CLIENT_SECRET = "test-github-client-secret";
process.env.GOOGLE_CLIENT_ID = "test-google-client-id";
process.env.GOOGLE_CLIENT_SECRET = "test-google-client-secret";
process.env.BETTER_AUTH_URL ??= "http://localhost:3001";
process.env.WEB_ORIGIN ??= "http://localhost:3000";

// better-auth は NODE_ENV=test(bun test のデフォルト)だと Origin / callbackURL の検証を
// スキップするため、本番同様に検証が走る状態で auth を読み込む
const originalNodeEnv = process.env.NODE_ENV;
process.env.NODE_ENV = "development";
const { auth } = await import("../../src/auth");
const authContext = await auth.$context; // コンテキスト生成時に NODE_ENV が参照される
process.env.NODE_ENV = originalNodeEnv;
void authContext;

const baseURL = process.env.BETTER_AUTH_URL!;
const webOrigin = process.env.WEB_ORIGIN!;

type Json = Record<string, unknown>;

async function post(path: string, body: Json, origin: string | null = webOrigin, cookie?: string) {
  const headers: Record<string, string> = { "content-type": "application/json" };
  if (origin) headers.origin = origin;
  if (cookie) headers.cookie = cookie;
  const res = await auth.handler(
    new Request(`${baseURL}${path}`, { method: "POST", headers, body: JSON.stringify(body) }),
  );
  const text = await res.text();
  let json: any = null;
  try {
    json = JSON.parse(text);
  } catch {}
  return { res, json };
}

const signInSocial = (body: Json, origin: string | null = webOrigin, cookie?: string) =>
  post("/api/auth/sign-in/social", body, origin, cookie);

// テストで作成され得る user / verification(state)を片付ける
const createdEmails = new Set<string>();
const createdStates = new Set<string>();

async function cleanup() {
  const { db } = await import("../../src/db");
  const schema = await import("../../src/db/auth-schema");
  const { inArray } = await import("drizzle-orm");
  if (createdEmails.size > 0) {
    await db.delete(schema.user).where(inArray(schema.user.email, [...createdEmails]));
  }
  if (createdStates.size > 0) {
    await db.delete(schema.verification).where(inArray(schema.verification.identifier, [...createdStates]));
  }
}

function track(url: string) {
  const state = new URL(url).searchParams.get("state");
  if (state) createdStates.add(state);
}

afterAll(async () => {
  await cleanup();
  const { db } = await import("../../src/db");
  // pg コネクションを閉じてテストプロセスが残らないようにする
  await (db as any).$client?.end?.();
});

describe("POST /api/auth/sign-in/social", () => {
  test("github: 認可 URL を返し、state と client_id を含む", async () => {
    const { res, json } = await signInSocial({ provider: "github" });
    expect(res.status).toBe(200);
    expect(json.redirect).toBe(true);
    track(json.url);

    const url = new URL(json.url);
    expect(url.origin + url.pathname).toBe("https://github.com/login/oauth/authorize");
    expect(url.searchParams.get("client_id")).toBe("test-github-client-id");
    expect(url.searchParams.get("state")).toBeTruthy();
    expect(url.searchParams.get("redirect_uri")).toBe(`${baseURL}/api/auth/callback/github`);
    expect(url.searchParams.get("response_type")).toBe("code");
  });

  test("github: 呼び出しごとに異なる state が発行される", async () => {
    const a = await signInSocial({ provider: "github" });
    const b = await signInSocial({ provider: "github" });
    track(a.json.url);
    track(b.json.url);
    const sa = new URL(a.json.url).searchParams.get("state");
    const sb = new URL(b.json.url).searchParams.get("state");
    expect(sa).not.toBe(sb);
  });

});
