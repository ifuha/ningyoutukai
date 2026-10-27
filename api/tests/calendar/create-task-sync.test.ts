import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, spyOn } from "bun:test";
import { mailer } from "../../src/lib/mailer";
import { cleanup, findTask, request, setupProduct } from "../task/helpers";
import { CALENDAR_SCOPE, EVENTS_URL, insertAccount, json, mockFetch, withGoogleEnv } from "./helpers";

// タスク作成と Google カレンダー同期の統合。Google の API は fetch の差し替えで検証する。
type Ctx = Awaited<ReturnType<typeof setupProduct>>;
let p: Ctx;
const sendSpy = spyOn(mailer, "send");
let restoreFetch: (() => void) | undefined;
let restoreEnv: (() => void) | undefined;
let warnSpy: ReturnType<typeof spyOn>;

beforeAll(async () => {
  p = await setupProduct();
  sendSpy.mockResolvedValue({ ok: true });
  // members[0] は Google 連携済み、members[1] は未連携
  await insertAccount(p.members[0]!.authUserId, {
    scope: `email,profile,${CALENDAR_SCOPE}`,
    accessToken: "access-ok",
    refreshToken: "refresh-1",
    accessTokenExpiresAt: new Date(Date.now() + 3600_000),
  });
});
beforeEach(() => {
  // 全テストを 1 つのプロセスで動かすため、先に動いた別のテストファイルの呼び出しが残る。実行順に依らないよう、毎回数え直す
  sendSpy.mockClear();
  restoreEnv = withGoogleEnv();
  warnSpy = spyOn(console, "warn").mockImplementation(() => {});
});
afterEach(() => {
  restoreFetch?.();
  restoreFetch = undefined;
  restoreEnv?.();
  restoreEnv = undefined;
  warnSpy.mockRestore();
  sendSpy.mockClear();
});
afterAll(async () => {
  sendSpy.mockRestore();
  await cleanup();
});

const DUE = "2030-01-02T03:04:05.000Z";
const post = (body: unknown) =>
  request("POST", `/api/product/${p.productId}/task`, { cookie: p.leader.cookie, body });

describe("タスク作成と Google カレンダー同期", () => {
  it("連携済みの担当者で期限付きなら、予定の作成が 1 回呼ばれる", async () => {
    const f = mockFetch(() => json({ id: "ev1" }));
    restoreFetch = f.restore;

    const res = await post({ taskName: "期限あり", productMemberId: p.members[0]!.memberId, timeLimit: DUE });

    expect(res.status).toBe(201);
    const created = (await res.json()) as { taskId: string };
    expect(f.calls).toHaveLength(1);
    const { url, init } = f.calls[0]!;
    expect(url).toBe(EVENTS_URL);
    expect(new Headers(init.headers).get("authorization")).toBe("Bearer access-ok");
    const body = JSON.parse(String(init.body));
    expect(body.summary).toBe("期限あり");
    expect(body.start.dateTime).toBe(DUE);
    expect(body.extendedProperties.private.ningyoutukaiTaskId).toBe(created.taskId);
    expect(sendSpy).toHaveBeenCalledTimes(1);
  });
  it("期限なしのタスクでは、呼ばれない", async () => {
    const f = mockFetch(() => json({}));
    restoreFetch = f.restore;
    const res = await post({ taskName: "期限なし", productMemberId: p.members[0]!.memberId });
    expect(res.status).toBe(201);
    expect(f.calls).toHaveLength(0);
    expect(sendSpy).toHaveBeenCalledTimes(1);
  });
  it("担当者が未連携なら呼ばれず、タスク作成は 201 のまま", async () => {
    const f = mockFetch(() => json({}));
    restoreFetch = f.restore;
    const res = await post({ taskName: "未連携", productMemberId: p.members[1]!.memberId, timeLimit: DUE });
    expect(res.status).toBe(201);
    expect(f.calls).toHaveLength(0);
    expect(sendSpy).toHaveBeenCalledTimes(1);
  });
  it("Google の API が 500 でも、タスクは作られ 201 で、メール通知も送られる", async () => {
    const f = mockFetch(() => json({ error: "boom" }, 500));
    restoreFetch = f.restore;
    const res = await post({ taskName: "Google 障害", productMemberId: p.members[0]!.memberId, timeLimit: DUE });
    expect(res.status).toBe(201);
    expect(f.calls).toHaveLength(1);
    const created = (await res.json()) as { taskId: string };
    expect((await findTask(created.taskId))?.taskName).toBe("Google 障害");
    expect(sendSpy).toHaveBeenCalledTimes(1);
  });
  it("fetch 自体が例外を投げても、タスク作成は 201 のまま", async () => {
    const f = mockFetch(() => {
      throw new Error("network down");
    });
    restoreFetch = f.restore;
    const res = await post({ taskName: "通信断", productMemberId: p.members[0]!.memberId, timeLimit: DUE });
    expect(res.status).toBe(201);
    expect(sendSpy).toHaveBeenCalledTimes(1);
  });
});
