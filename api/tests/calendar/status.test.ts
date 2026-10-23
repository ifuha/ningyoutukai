import { afterAll, describe, expect, it } from "bun:test";
import { Elysia } from "elysia";
import { calendarRoutes } from "../../src/routes/calendar";
import { cleanup, createOutsider } from "../task/helpers";
import { CALENDAR_SCOPE, insertAccount } from "./helpers";

const app = new Elysia().use(calendarRoutes);
const status = (cookie?: string) =>
  app.handle(
    new Request("http://localhost/api/calendar/status", {
      headers: cookie ? { cookie } : {},
    }),
  );

/** ユーザーを作り、指定の account を 1 つ付けて、状態 API の connected を返す */
async function connectedFor(account?: Parameters<typeof insertAccount>[1]) {
  const u = await createOutsider();
  if (account) await insertAccount(u.authUserId, account);
  const res = await status(u.cookie);
  expect(res.status).toBe(200);
  return ((await res.json()) as { connected: boolean }).connected;
}

afterAll(async () => {
  await cleanup();
});

describe("GET /api/calendar/status", () => {
  it("未ログインは 401", async () => {
    expect((await status()).status).toBe(401);
  });
  it("Google の account が無いと connected: false", async () => {
    const u = await createOutsider();
    const res = await status(u.cookie);
    expect(await res.json()).toEqual({ connected: false });
  });
  it("GitHub の account しか無い人は false(scope とトークンがあっても)", async () => {
    expect(
      await connectedFor({ providerId: "github", scope: CALENDAR_SCOPE, refreshToken: "r" }),
    ).toBe(false);
  });
  it("Google の account があっても calendar.events の scope が無ければ false", async () => {
    expect(await connectedFor({ scope: "openid,email,profile", refreshToken: "r" })).toBe(false);
  });
  it("scope が null なら false", async () => {
    expect(await connectedFor({ scope: null, refreshToken: "r" })).toBe(false);
  });
  it("scope があってもリフレッシュトークンが無ければ false", async () => {
    expect(await connectedFor({ scope: CALENDAR_SCOPE, refreshToken: null })).toBe(false);
  });
  it("scope(カンマ区切り)とリフレッシュトークンがあれば true", async () => {
    expect(await connectedFor({ scope: `email,profile,${CALENDAR_SCOPE}`, refreshToken: "r" })).toBe(true);
  });
  it("scope(空白区切り)とリフレッシュトークンがあれば true", async () => {
    expect(await connectedFor({ scope: `openid email ${CALENDAR_SCOPE}`, refreshToken: "r" })).toBe(true);
  });
  it("scope が似ているだけ(末尾違い)では false", async () => {
    expect(await connectedFor({ scope: `${CALENDAR_SCOPE}.readonly`, refreshToken: "r" })).toBe(false);
  });
});
