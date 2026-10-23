import { eq } from "drizzle-orm";
import { spyOn } from "bun:test";
import { db } from "../../src/db";
import { account } from "../../src/db/auth-schema";

/** Google カレンダー連携のテスト共通ヘルパー。ユーザー・プロダクトは tests/task/helpers.ts のものを使う。 */

export const CALENDAR_SCOPE = "https://www.googleapis.com/auth/calendar.events";
export const TOKEN_URL = "https://oauth2.googleapis.com/token";
export const EVENTS_URL = "https://www.googleapis.com/calendar/v3/calendars/primary/events";

/** better-auth のユーザーに、外部認証の account の行を直接作る(OAuth 通信はしない) */
export async function insertAccount(
  authUserId: string,
  values: Partial<typeof account.$inferInsert> = {},
) {
  const id = crypto.randomUUID();
  await db.insert(account).values({
    id,
    accountId: `acct-${id}`,
    providerId: "google",
    userId: authUserId,
    ...values,
  });
  return id;
}

export async function findAccount(id: string) {
  const [row] = await db.select().from(account).where(eq(account.id, id));
  return row!;
}

export type FetchCall = { url: string; init: RequestInit };

/**
 * globalThis.fetch を差し替える(実際の通信はしない)。戻り値の restore() で元に戻す。
 * respond は呼び出しごとに Response を返す。
 */
export function mockFetch(respond: (call: FetchCall, index: number) => Response) {
  const calls: FetchCall[] = [];
  const spy = spyOn(globalThis, "fetch").mockImplementation((async (
    input: unknown,
    init?: RequestInit,
  ) => {
    const call = { url: String(input), init: init ?? {} };
    calls.push(call);
    return respond(call, calls.length - 1);
  }) as unknown as typeof fetch);
  return { calls, restore: () => spy.mockRestore() };
}

export const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });

export const headerOf = (init: RequestInit, name: string) =>
  new Headers(init.headers).get(name);

/** Google の環境変数を一時的に設定する。戻り値の restore() で元に戻す */
export function withGoogleEnv(id = "cid-test", secret = "csecret-test") {
  const prev = {
    id: process.env.GOOGLE_CLIENT_ID,
    secret: process.env.GOOGLE_CLIENT_SECRET,
  };
  process.env.GOOGLE_CLIENT_ID = id;
  process.env.GOOGLE_CLIENT_SECRET = secret;
  return () => {
    if (prev.id === undefined) delete process.env.GOOGLE_CLIENT_ID;
    else process.env.GOOGLE_CLIENT_ID = prev.id;
    if (prev.secret === undefined) delete process.env.GOOGLE_CLIENT_SECRET;
    else process.env.GOOGLE_CLIENT_SECRET = prev.secret;
  };
}
