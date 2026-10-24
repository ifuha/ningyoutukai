import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { app } from "../../src/app";
import { cleanup, createTaskType, insertTask, setupProduct } from "./helpers";

// プロダクト・カレンダーのルートも含めるため、アプリ全体を呼ぶ
function request(method: string, path: string, { cookie, body }: { cookie?: string; body?: unknown } = {}) {
  const headers = new Headers();
  if (cookie) headers.set("cookie", cookie);
  if (body !== undefined) headers.set("content-type", "application/json");
  return app.handle(
    new Request(`http://localhost${path}`, {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
    })
  );
}

afterAll(cleanup);

let p: Awaited<ReturnType<typeof setupProduct>>;

beforeAll(async () => {
  p = await setupProduct({ members: 1 });
});

// 応答スキーマ(`response`)を付けても、応答の形(フィールドの集合・日時が ISO 文字列・null)が変わらないこと
const TASK_KEYS = [
  "completedAt",
  "description",
  "isVisible",
  "productMemberId",
  "reportedAt",
  "taskId",
  "taskName",
  "taskTypeId",
  "timeLimit",
];
const PRODUCT_KEYS = ["createdAt", "productId", "productName", "role"];

describe("応答スキーマを付けても、応答の形が変わらない", () => {
  test("タスク: すべてのフィールドが出て、日時は ISO 文字列、無い値は null", async () => {
    const timeLimit = new Date("2026-12-01T00:00:00.000Z");
    const task = await insertTask(p.members[0]!.memberId, { timeLimit });
    const res = await request("GET", `/api/product/${p.productId}/task/${task.taskId}`, {
      cookie: p.leader.cookie,
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(Object.keys(body).sort()).toEqual(TASK_KEYS);
    expect(body).toMatchObject({
      timeLimit: "2026-12-01T00:00:00.000Z",
      description: null,
      reportedAt: null,
      completedAt: null,
      taskTypeId: null,
    });
  });

  test("種類の割り当て・完了確定・一覧も、同じ形", async () => {
    const kind = await createTaskType(p.productId);
    const task = await insertTask(p.members[0]!.memberId);
    const base = `/api/product/${p.productId}/task/${task.taskId}`;

    const assigned = await request("PATCH", `${base}/task_kinds/${kind.taskTypeId}`, {
      cookie: p.leader.cookie,
    });
    expect(assigned.status).toBe(200);
    const assignedBody = await assigned.json();
    expect(Object.keys(assignedBody).sort()).toEqual(TASK_KEYS);
    expect(assignedBody.taskTypeId).toBe(kind.taskTypeId);

    const completed = await request("PATCH", `${base}/complete`, { cookie: p.leader.cookie });
    expect(completed.status).toBe(200);
    const completedBody = await completed.json();
    expect(Object.keys(completedBody).sort()).toEqual(TASK_KEYS);
    expect(typeof completedBody.completedAt).toBe("string");

    const list = await request("GET", `/api/product/${p.productId}/task?includeCompleted=true`, {
      cookie: p.leader.cookie,
    });
    expect(list.status).toBe(200);
    for (const row of await list.json()) expect(Object.keys(row).sort()).toEqual(TASK_KEYS);
  });

  test("プロダクト: 作成・一覧・取得は同じ形で、createdAt は ISO 文字列", async () => {
    const created = await request("POST", "/api/product", {
      cookie: p.leader.cookie,
      body: { productName: "schema-check" },
    });
    expect(created.status).toBe(201);
    const createdBody = await created.json();
    expect(Object.keys(createdBody).sort()).toEqual(PRODUCT_KEYS);
    expect(createdBody.role).toBe("leader");
    expect(new Date(createdBody.createdAt).toISOString()).toBe(createdBody.createdAt);

    const one = await request("GET", `/api/product/${createdBody.productId}`, {
      cookie: p.leader.cookie,
    });
    expect(Object.keys(await one.json()).sort()).toEqual(PRODUCT_KEYS);

    const list = await request("GET", "/api/product", { cookie: p.leader.cookie });
    for (const row of await list.json()) expect(Object.keys(row).sort()).toEqual(PRODUCT_KEYS);

    // 作ったプロダクトは消しておく
    await request("DELETE", `/api/product/${createdBody.productId}`, { cookie: p.leader.cookie });
  });

  test("カレンダーの状態は { connected } だけ", async () => {
    const res = await request("GET", "/api/calendar/status", { cookie: p.leader.cookie });
    expect(res.status).toBe(200);
    expect(Object.keys(await res.json())).toEqual(["connected"]);
  });
});
