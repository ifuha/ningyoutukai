import { afterAll, describe, expect, test } from "bun:test";
import { app } from "../../src/app";
import { CLI_CLIENT_ID, webOrigin } from "../../src/auth";
import { cleanup, createOutsider } from "../task/helpers";

// CLI のログイン(デバイスコード + ベアラートークン)。docs/v3.0/cli.md の「3. 認証」
// 流れ: CLI がコードを受け取る → ブラウザ(ログイン済み)が承認する → CLI がトークンを受け取る → トークンで API を呼ぶ

afterAll(cleanup);

// ブラウザが cookie つきの POST に付ける Origin(better-auth の CSRF 対策が、信頼するオリジンだけを通す)
const browser = (cookie: string) => ({ cookie, origin: webOrigin });

// 承認ページを開いたとき(コードの確認)。コードを、ログイン中の人に結びつける。承認・拒否の前に必要
const claim = (userCode: string, cookie: string) =>
  app.handle(
    new Request(`http://localhost/api/auth/device?user_code=${encodeURIComponent(userCode)}`, {
      headers: { cookie, origin: webOrigin },
    }),
  );

const GRANT = "urn:ietf:params:oauth:grant-type:device_code";

function post(path: string, body: unknown, headers: Record<string, string> = {}) {
  return app.handle(
    new Request(`http://localhost${path}`, {
      method: "POST",
      headers: { "content-type": "application/json", ...headers },
      body: JSON.stringify(body),
    }),
  );
}

const requestCode = (clientId: string = CLI_CLIENT_ID) =>
  post("/api/auth/device/code", { client_id: clientId });

const pollToken = (deviceCode: string, clientId: string = CLI_CLIENT_ID) =>
  post("/api/auth/device/token", { grant_type: GRANT, device_code: deviceCode, client_id: clientId });

describe("デバイスコードの発行", () => {
  test("許可した client_id には、コードと確認用の URL(Web の /device)を返す", async () => {
    const res = await requestCode();
    expect(res.status).toBe(200);
    const body = (await res.json()) as Record<string, unknown>;
    expect(typeof body.device_code).toBe("string");
    expect(typeof body.user_code).toBe("string");
    expect(String(body.verification_uri)).toEndWith("/device");
    expect(String(body.verification_uri_complete)).toContain("user_code=");
    // 有効期限は 15 分、確認の間隔は 5 秒
    expect(body.expires_in).toBe(900);
    expect(body.interval).toBe(5);
  });

  test("知らない client_id は断る", async () => {
    const res = await requestCode("unknown-client");
    expect(res.status).toBe(400);
  });
});

describe("承認の前", () => {
  test("承認されるまでは、トークンを渡さない(authorization_pending)", async () => {
    const code = (await (await requestCode()).json()) as { device_code: string };
    const res = await pollToken(code.device_code);
    expect(res.status).toBe(400);
    expect(((await res.json()) as { error: string }).error).toBe("authorization_pending");
  });

  test("ログインしていない人は、承認できない", async () => {
    const code = (await (await requestCode()).json()) as { user_code: string };
    const res = await post("/api/auth/device/approve", { userCode: code.user_code }, { origin: webOrigin });
    expect(res.status).toBe(401);
  });

  test("信頼しないオリジンからは、ログイン済みでも承認できない(CSRF 対策)", async () => {
    const user = await createOutsider();
    const code = (await (await requestCode()).json()) as { user_code: string };
    const res = await post(
      "/api/auth/device/approve",
      { userCode: code.user_code },
      { cookie: user.cookie, origin: "https://evil.example.com" },
    );
    expect(res.status).toBe(403);
  });
});

describe("承認 → トークン → API", () => {
  test("ログイン済みの人が承認すると、CLI がトークンを受け取り、そのトークンで API を呼べる", async () => {
    const user = await createOutsider();
    const code = (await (await requestCode()).json()) as { device_code: string; user_code: string };

    expect((await claim(code.user_code, user.cookie)).status).toBe(200)
    const approve = await post("/api/auth/device/approve", { userCode: code.user_code }, browser(user.cookie));
    expect(approve.status).toBe(200);

    const token = await pollToken(code.device_code);
    expect(token.status).toBe(200);
    const issued = (await token.json()) as { access_token: string; token_type: string };
    expect(issued.token_type.toLowerCase()).toBe("bearer");
    expect(issued.access_token.length).toBeGreaterThan(10);

    // cookie なしで、ベアラートークンだけで、ログイン必須の API が通る
    const me = await app.handle(
      new Request("http://localhost/api/product", {
        headers: { authorization: `Bearer ${issued.access_token}` },
      }),
    );
    expect(me.status).toBe(200);
  });

  test("承認したコードは、1 回しかトークンに替えられない", async () => {
    const user = await createOutsider();
    const code = (await (await requestCode()).json()) as { device_code: string; user_code: string };
    await claim(code.user_code, user.cookie);
    await post("/api/auth/device/approve", { userCode: code.user_code }, browser(user.cookie));
    expect((await pollToken(code.device_code)).status).toBe(200);
    expect((await pollToken(code.device_code)).status).toBe(400);
  });

  test("拒否したコードでは、トークンを渡さない(access_denied)", async () => {
    const user = await createOutsider();
    const code = (await (await requestCode()).json()) as { device_code: string; user_code: string };
    await claim(code.user_code, user.cookie);
    const deny = await post("/api/auth/device/deny", { userCode: code.user_code }, browser(user.cookie));
    expect(deny.status).toBe(200);
    const res = await pollToken(code.device_code);
    expect(res.status).toBe(400);
    expect(((await res.json()) as { error: string }).error).toBe("access_denied");
  });
});

describe("コードの確認(claim)", () => {
  test("確認(承認ページを開く)の前は、承認できない", async () => {
    const user = await createOutsider();
    const code = (await (await requestCode()).json()) as { user_code: string };
    const res = await post("/api/auth/device/approve", { userCode: code.user_code }, browser(user.cookie));
    expect(res.status).toBe(400);
  });

  test("別の人が確認したコードは、ほかの人が承認できない", async () => {
    const owner = await createOutsider();
    const other = await createOutsider();
    const code = (await (await requestCode()).json()) as { device_code: string; user_code: string };
    expect((await claim(code.user_code, owner.cookie)).status).toBe(200);
    const res = await post("/api/auth/device/approve", { userCode: code.user_code }, browser(other.cookie));
    expect(res.status).not.toBe(200);
    // 承認されていないので、トークンは渡らない
    expect((await pollToken(code.device_code)).status).toBe(400);
  });
});

describe("ベアラートークンの扱い", () => {
  test("でたらめなトークンは 401", async () => {
    const res = await app.handle(
      new Request("http://localhost/api/product", { headers: { authorization: "Bearer not-a-real-token" } }),
    );
    expect(res.status).toBe(401);
  });

  test("トークンも cookie もなければ 401(これまでどおり)", async () => {
    const res = await app.handle(new Request("http://localhost/api/product"));
    expect(res.status).toBe(401);
  });
});
