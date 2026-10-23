import { and, eq } from "drizzle-orm";
import { symmetricDecrypt, symmetricEncrypt } from "better-auth/crypto";
import { auth } from "../auth";
import { db } from "../db";
import { account as authAccount, user as authUser } from "../db/auth-schema";

export const GOOGLE_CALENDAR_EVENTS_SCOPE =
  "https://www.googleapis.com/auth/calendar.events";

type GoogleAccount = {
  id: string;
  scope: string | null;
  accessToken: string | null;
  refreshToken: string | null;
  accessTokenExpiresAt: Date | null;
};

/**
 * トークンは、better-auth の `account.encryptOAuthTokens` と同じ方式(鍵は BETTER_AUTH_SECRET 由来)で暗号化して保存する。
 * `auth.api.getAccessToken` は、失効(invalid_grant)と一時的な失敗を区別せず、失効時にトークンも消せないため使わない。
 * 暗号化前に保存済みの平文の行も読めるよう、暗号文らしくない値は、そのまま返す
 * (判定は better-auth の `decryptOAuthToken` / `isLikelyEncrypted` と同じ)。
 */
async function secretKey() {
  return (await auth.$context).secretConfig;
}

function looksEncrypted(token: string) {
  return token.startsWith("$ba$") || (token.length % 2 === 0 && /^[0-9a-f]+$/i.test(token));
}

/** 復号できない(BETTER_AUTH_SECRET が変わった、など)ときは undefined */
async function decryptToken(token: string | null): Promise<string | null | undefined> {
  if (!token || !looksEncrypted(token)) return token;
  try {
    return await symmetricDecrypt({ key: await secretKey(), data: token });
  } catch {
    return undefined;
  }
}

async function encryptToken(token: string) {
  return symmetricEncrypt({ key: await secretKey(), data: token });
}

/** 連携を解除した状態にする(トークンを消す)。再連携すれば、また使える */
async function clearTokens(accountId: string) {
  await db
    .update(authAccount)
    .set({ accessToken: null, refreshToken: null, accessTokenExpiresAt: null })
    .where(eq(authAccount.id, accountId));
}

async function findGoogleAccount(email: string): Promise<GoogleAccount | null> {
  const [row] = await db
    .select({
      id: authAccount.id,
      scope: authAccount.scope,
      accessToken: authAccount.accessToken,
      refreshToken: authAccount.refreshToken,
      accessTokenExpiresAt: authAccount.accessTokenExpiresAt,
    })
    .from(authAccount)
    .innerJoin(authUser, eq(authAccount.userId, authUser.id))
    .where(and(eq(authUser.email, email), eq(authAccount.providerId, "google")))
    .limit(1);
  if (!row) return null;

  const refreshToken = await decryptToken(row.refreshToken);
  const accessToken = await decryptToken(row.accessToken);
  if (refreshToken === undefined || accessToken === undefined) {
    // 保存済みのトークンを復号できない。使えないので消して、再連携してもらう
    console.warn("[google-calendar] stored tokens could not be decrypted; clearing them (BETTER_AUTH_SECRET changed?)");
    await clearTokens(row.id);
    return { ...row, accessToken: null, refreshToken: null, accessTokenExpiresAt: null };
  }
  return { ...row, accessToken, refreshToken };
}

function hasCalendarScope(scope: string | null) {
	// Better Auth persists provider scopes as a comma-separated string, while
	// OAuth providers may return a space-separated value. Accept both formats.
	return scope?.split(/[\s,]+/).includes(GOOGLE_CALENDAR_EVENTS_SCOPE) ?? false;
}

export async function hasGoogleCalendarConnection(email: string) {
  const account = await findGoogleAccount(email);
  return Boolean(
    account &&
      hasCalendarScope(account.scope) &&
      account.refreshToken,
  );
}

async function refreshAccessToken(account: GoogleAccount): Promise<string | null> {
  if (!account.refreshToken) return null;

  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
  if (!clientId || !clientSecret) {
    console.warn("[google-calendar] GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET is not set; cannot refresh the access token");
    return null;
  }

  const response = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      refresh_token: account.refreshToken,
      grant_type: "refresh_token",
    }),
  });
  if (!response.ok) {
    // リフレッシュトークンの失効(ユーザーが Google 側で連携を外した、など)。再連携が必要なのでトークンを消す。
    // 500 やネットワークの失敗など、一時的なものでは消さない
    const body = (await response.json().catch(() => null)) as { error?: string } | null;
    if (response.status === 400 && body?.error === "invalid_grant") {
      console.warn("[google-calendar] refresh token is no longer valid (invalid_grant); disconnecting");
      await clearTokens(account.id);
      return null;
    }
    console.warn(`[google-calendar] token refresh failed (${response.status})`);
    return null;
  }

  const tokens = (await response.json()) as {
    access_token?: string;
    expires_in?: number;
    refresh_token?: string;
  };
  if (!tokens.access_token) return null;

  const expiresAt =
    typeof tokens.expires_in === "number"
      ? new Date(Date.now() + tokens.expires_in * 1000)
      : null;
  await db
    .update(authAccount)
    .set({
      accessToken: await encryptToken(tokens.access_token),
      accessTokenExpiresAt: expiresAt,
      ...(tokens.refresh_token ? { refreshToken: await encryptToken(tokens.refresh_token) } : {}),
    })
    .where(eq(authAccount.id, account.id));

  return tokens.access_token;
}

async function getAccessToken(account: GoogleAccount): Promise<string | null> {
  const expiresSoon =
    account.accessTokenExpiresAt !== null &&
    account.accessTokenExpiresAt.getTime() < Date.now() + 60_000;

  if (account.accessToken && !expiresSoon) return account.accessToken;
  return refreshAccessToken(account);
}

async function insertDeadlineEvent(
  accessToken: string,
  input: { taskId: string; taskName: string; dueAt: string },
) {
  const start = new Date(input.dueAt);
  const dateTime = start.toISOString();

  return fetch(
    "https://www.googleapis.com/calendar/v3/calendars/primary/events",
    {
      method: "POST",
      headers: {
        authorization: `Bearer ${accessToken}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        summary: input.taskName,
        description: `人形使いのタスク期限 (taskId: ${input.taskId})`,
        start: { dateTime, timeZone: "Asia/Tokyo" },
        end: { dateTime, timeZone: "Asia/Tokyo" },
        extendedProperties: { private: { ningyoutukaiTaskId: input.taskId } },
      }),
    },
  );
}

/** カレンダー同期が失敗しても、タスク作成を失敗させないため結果を呼び出し元へ返す。 */
export async function addTaskDeadlineToGoogleCalendar(input: {
  email: string;
  taskId: string;
  taskName: string;
  dueAt: string;
}): Promise<"created" | "not-connected" | "failed"> {
  const account = await findGoogleAccount(input.email);
  if (
    !account ||
    !hasCalendarScope(account.scope) ||
    !account.refreshToken
  ) {
    return "not-connected";
  }

  let accessToken = await getAccessToken(account);
  if (!accessToken) return "failed";

  let response = await insertDeadlineEvent(accessToken, input);
  if (response.status === 401) {
    accessToken = await refreshAccessToken(account);
    if (accessToken) response = await insertDeadlineEvent(accessToken, input);
  }

  if (!response.ok) {
    console.warn(`[google-calendar] event insert failed (${response.status})`);
    return "failed";
  }
  return "created";
}
