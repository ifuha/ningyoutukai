import { afterAll, afterEach, beforeEach, describe, expect, it, spyOn } from "bun:test";
import { addTaskDeadlineToGoogleCalendar } from "../../src/lib/google-calendar";
import { cleanup, createOutsider } from "../task/helpers";
import {
  CALENDAR_SCOPE,
  EVENTS_URL,
  TOKEN_URL,
  findAccount,
  headerOf,
  insertAccount,
  json,
  mockFetch,
  withGoogleEnv,
} from "./helpers";

// Google の API は実際には呼ばない。fetch を差し替えて、呼び出しの URL・ヘッダ・本文を検証する。
let restoreFetch: (() => void) | undefined;
let restoreEnv: (() => void) | undefined;
let warnSpy: ReturnType<typeof spyOn>;

beforeEach(() => {
  restoreEnv = withGoogleEnv();
  warnSpy = spyOn(console, "warn").mockImplementation(() => {});
});
afterEach(() => {
  restoreFetch?.();
  restoreFetch = undefined;
  restoreEnv?.();
  restoreEnv = undefined;
  warnSpy.mockRestore();
});
afterAll(async () => {
  await cleanup();
});

const DUE = "2026-12-31T09:30:00.000Z";
const future = (ms: number) => new Date(Date.now() + ms);

/** 連携済み(scope とリフレッシュトークンあり)のユーザーを作る */
async function connectedUser(values: Parameters<typeof insertAccount>[1] = {}) {
  const u = await createOutsider();
  const accountId = await insertAccount(u.authUserId, {
    scope: `email,profile,${CALENDAR_SCOPE}`,
    accessToken: "access-old",
    refreshToken: "refresh-1",
    accessTokenExpiresAt: future(3600_000),
    ...values,
  });
  return { ...u, accountId };
}

const run = (email: string) =>
  addTaskDeadlineToGoogleCalendar({ email, taskId: "task-1", taskName: "資料を作る", dueAt: DUE });

const tokenBody = (init: RequestInit) => new URLSearchParams(String(init.body));

describe("未連携", () => {
  it("account が無ければ not-connected で、fetch は呼ばれない", async () => {
    const u = await createOutsider();
    const f = mockFetch(() => json({}));
    restoreFetch = f.restore;
    expect(await run(u.email)).toBe("not-connected");
    expect(f.calls).toHaveLength(0);
  });
  it("scope が無ければ not-connected", async () => {
    const u = await connectedUser({ scope: "email,profile" });
    const f = mockFetch(() => json({}));
    restoreFetch = f.restore;
    expect(await run(u.email)).toBe("not-connected");
    expect(f.calls).toHaveLength(0);
  });
  it("リフレッシュトークンが無ければ not-connected", async () => {
    const u = await connectedUser({ refreshToken: null });
    const f = mockFetch(() => json({}));
    restoreFetch = f.restore;
    expect(await run(u.email)).toBe("not-connected");
    expect(f.calls).toHaveLength(0);
  });
});

describe("アクセストークンが有効", () => {
  it("更新せずに予定を作成して created", async () => {
    const u = await connectedUser();
    const f = mockFetch(() => json({ id: "ev1" }));
    restoreFetch = f.restore;

    expect(await run(u.email)).toBe("created");

    expect(f.calls).toHaveLength(1);
    const { url, init } = f.calls[0]!;
    expect(url).toBe(EVENTS_URL);
    expect(init.method).toBe("POST");
    expect(headerOf(init, "authorization")).toBe("Bearer access-old");
    expect(headerOf(init, "content-type")).toBe("application/json");
    const body = JSON.parse(String(init.body));
    expect(body.summary).toBe("資料を作る");
    expect(body.start).toEqual({ dateTime: DUE, timeZone: "Asia/Tokyo" });
    expect(body.end).toEqual({ dateTime: DUE, timeZone: "Asia/Tokyo" });
    expect(body.extendedProperties).toEqual({ private: { ningyoutukaiTaskId: "task-1" } });
    // DB のトークンは変わらない
    expect((await findAccount(u.accountId)).accessToken).toBe("access-old");
  });
  it("期限が無い(null)アクセストークンは、期限切れ扱いにせず、そのまま使う", async () => {
    const u = await connectedUser({ accessTokenExpiresAt: null });
    const f = mockFetch(() => json({}));
    restoreFetch = f.restore;
    expect(await run(u.email)).toBe("created");
    expect(f.calls.map((c) => c.url)).toEqual([EVENTS_URL]);
  });
});

describe("アクセストークンの更新", () => {
  it("期限切れなら、先に token エンドポイントで更新し、新しいトークンで予定を作る。DB も更新される", async () => {
    const u = await connectedUser({ accessTokenExpiresAt: future(-1000) });
    const f = mockFetch((c) =>
      c.url === TOKEN_URL ? json({ access_token: "access-new", expires_in: 3600 }) : json({}),
    );
    restoreFetch = f.restore;
    const before = Date.now();

    expect(await run(u.email)).toBe("created");

    expect(f.calls.map((c) => c.url)).toEqual([TOKEN_URL, EVENTS_URL]);
    const token = f.calls[0]!.init;
    expect(token.method).toBe("POST");
    expect(headerOf(token, "content-type")).toBe("application/x-www-form-urlencoded");
    const form = tokenBody(token);
    expect(form.get("grant_type")).toBe("refresh_token");
    expect(form.get("refresh_token")).toBe("refresh-1");
    expect(form.get("client_id")).toBe("cid-test");
    expect(form.get("client_secret")).toBe("csecret-test");
    expect(headerOf(f.calls[1]!.init, "authorization")).toBe("Bearer access-new");

    const row = await findAccount(u.accountId);
    expect(row.accessToken).toBe("access-new");
    expect(row.refreshToken).toBe("refresh-1"); // 返ってこなければ、そのまま
    const exp = row.accessTokenExpiresAt!.getTime();
    expect(exp).toBeGreaterThanOrEqual(before + 3600_000 - 2000);
    expect(exp).toBeLessThanOrEqual(Date.now() + 3600_000 + 2000);
  });
  it("期限まで 60 秒以内でも更新する(新しいリフレッシュトークンが返れば保存する)", async () => {
    const u = await connectedUser({ accessTokenExpiresAt: future(30_000) });
    const f = mockFetch((c) =>
      c.url === TOKEN_URL
        ? json({ access_token: "access-new", expires_in: 3600, refresh_token: "refresh-2" })
        : json({}),
    );
    restoreFetch = f.restore;

    expect(await run(u.email)).toBe("created");

    expect(f.calls.map((c) => c.url)).toEqual([TOKEN_URL, EVENTS_URL]);
    const row = await findAccount(u.accountId);
    expect(row.accessToken).toBe("access-new");
    expect(row.refreshToken).toBe("refresh-2");
  });
  it("期限まで 60 秒より先なら更新しない", async () => {
    const u = await connectedUser({ accessTokenExpiresAt: future(120_000) });
    const f = mockFetch(() => json({}));
    restoreFetch = f.restore;
    expect(await run(u.email)).toBe("created");
    expect(f.calls.map((c) => c.url)).toEqual([EVENTS_URL]);
  });
  it("アクセストークンが無ければ更新して作る", async () => {
    const u = await connectedUser({ accessToken: null, accessTokenExpiresAt: null });
    const f = mockFetch((c) =>
      c.url === TOKEN_URL ? json({ access_token: "access-new", expires_in: 3600 }) : json({}),
    );
    restoreFetch = f.restore;
    expect(await run(u.email)).toBe("created");
    expect(f.calls.map((c) => c.url)).toEqual([TOKEN_URL, EVENTS_URL]);
  });
  it("更新に失敗(400)したら failed で、予定は作らず、例外も投げない。DB は変わらない", async () => {
    const u = await connectedUser({ accessTokenExpiresAt: future(-1000) });
    const f = mockFetch(() => json({ error: "invalid_grant" }, 400));
    restoreFetch = f.restore;

    expect(await run(u.email)).toBe("failed");

    expect(f.calls.map((c) => c.url)).toEqual([TOKEN_URL]);
    expect((await findAccount(u.accountId)).accessToken).toBe("access-old");
  });
  it("GOOGLE_CLIENT_ID / SECRET が無ければ、更新できず failed(fetch は呼ばれない)", async () => {
    const u = await connectedUser({ accessTokenExpiresAt: future(-1000) });
    delete process.env.GOOGLE_CLIENT_ID;
    delete process.env.GOOGLE_CLIENT_SECRET;
    const f = mockFetch(() => json({}));
    restoreFetch = f.restore;
    expect(await run(u.email)).toBe("failed");
    expect(f.calls).toHaveLength(0);
  });
  it("token の応答に access_token が無ければ failed", async () => {
    const u = await connectedUser({ accessTokenExpiresAt: future(-1000) });
    const f = mockFetch(() => json({ expires_in: 3600 }));
    restoreFetch = f.restore;
    expect(await run(u.email)).toBe("failed");
    expect(f.calls).toHaveLength(1);
  });
});

describe("予定の作成が失敗したとき", () => {
  it("401 なら、更新して 1 回だけ再試行し、成功すれば created", async () => {
    const u = await connectedUser();
    const f = mockFetch((c, i) => {
      if (c.url === TOKEN_URL) return json({ access_token: "access-new", expires_in: 3600 });
      return i === 0 ? json({ error: "unauth" }, 401) : json({});
    });
    restoreFetch = f.restore;

    expect(await run(u.email)).toBe("created");

    expect(f.calls.map((c) => c.url)).toEqual([EVENTS_URL, TOKEN_URL, EVENTS_URL]);
    expect(headerOf(f.calls[0]!.init, "authorization")).toBe("Bearer access-old");
    expect(headerOf(f.calls[2]!.init, "authorization")).toBe("Bearer access-new");
    expect((await findAccount(u.accountId)).accessToken).toBe("access-new");
  });
  it("401 が続いても、再試行は 1 回だけで failed", async () => {
    const u = await connectedUser();
    const f = mockFetch((c) =>
      c.url === TOKEN_URL
        ? json({ access_token: "access-new", expires_in: 3600 })
        : json({ error: "unauth" }, 401),
    );
    restoreFetch = f.restore;

    expect(await run(u.email)).toBe("failed");

    expect(f.calls.map((c) => c.url)).toEqual([EVENTS_URL, TOKEN_URL, EVENTS_URL]);
  });
  it("401 のあと更新にも失敗したら failed(再試行しない)", async () => {
    const u = await connectedUser();
    const f = mockFetch((c) =>
      c.url === TOKEN_URL ? json({ error: "invalid_grant" }, 400) : json({}, 401),
    );
    restoreFetch = f.restore;
    expect(await run(u.email)).toBe("failed");
    expect(f.calls.map((c) => c.url)).toEqual([EVENTS_URL, TOKEN_URL]);
  });
  it("500 なら failed で、更新も再試行もしない。例外は投げない", async () => {
    const u = await connectedUser();
    const f = mockFetch(() => json({ error: "boom" }, 500));
    restoreFetch = f.restore;
    expect(await run(u.email)).toBe("failed");
    expect(f.calls.map((c) => c.url)).toEqual([EVENTS_URL]);
  });
});
