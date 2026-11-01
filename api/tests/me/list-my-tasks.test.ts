import { afterAll, beforeAll, describe, expect, it } from "bun:test";
import { app } from "../../src/app";
import { db } from "../../src/db";
import { productMembers } from "../../src/db/schema";
import { cleanup, createOutsider, insertTask, setupProduct } from "../task/helpers";

// 自分に割り振られたタスクを、全プロダクトをまたいで取得 GET /api/me/task(CLI の `tasks`)

afterAll(cleanup);

type Row = {
  taskId: string;
  taskName: string;
  status: string;
  isVisible: boolean;
  productId: string;
  productName: string;
};

function get(query: string, cookie?: string) {
  const headers = new Headers();
  if (cookie) headers.set("cookie", cookie);
  return app.handle(new Request(`http://localhost/api/me/task${query}`, { headers }));
}
const list = async (query: string, cookie: string) => (await (await get(query, cookie)).json()) as Row[];

// me は、A・B 2 つのプロダクトのメンバー。other は、A の別のメンバー
let a: Awaited<ReturnType<typeof setupProduct>>;
let b: Awaited<ReturnType<typeof setupProduct>>;
let meA: string; // me の A でのメンバー ID
let meB: string;
let cookie: string;
let tasks: Record<string, string>;

beforeAll(async () => {
  a = await setupProduct({ members: 2 });
  b = await setupProduct({ members: 1 });
  const me = a.members[0]!;
  cookie = me.cookie;
  meA = me.memberId;
  // me を B にも参加させる
  const [joined] = await db
    .insert(productMembers)
    .values({ productId: b.productId, userId: me.userId, role: "member" })
    .returning();
  meB = joined!.productMemberId;

  const day = (n: number) => new Date(Date.UTC(2030, 0, n));
  const t = async (key: string, memberId: string, values = {}) =>
    (tasks[key] = (await insertTask(memberId, { taskName: key, ...values }))!.taskId);
  tasks = {};
  await t("A-遅い", meA, { timeLimit: day(20) });
  await t("A-早い", meA, { timeLimit: day(10) });
  await t("A-期限なし", meA);
  await t("A-非表示", meA, { isVisible: false, timeLimit: day(15) });
  await t("A-完了", meA, { completedAt: day(1), timeLimit: day(5) });
  await t("A-確認待ち", meA, { reportedAt: day(2), timeLimit: day(12) });
  await t("B-1", meB, { timeLimit: day(11) });
  // 他人のタスク(出てはいけない)
  await t("A-他人", a.members[1]!.memberId, { timeLimit: day(1) });
  await t("A-リーダー", a.leader.memberId, { timeLimit: day(1) });
  await t("B-他人", b.leader.memberId, { timeLimit: day(1) });
});

describe("GET /api/me/task", () => {
  it("ログインしていなければ 401", async () => {
    expect((await get("")).status).toBe(401);
  });

  it("自分のタスクだけを、全プロダクトをまたいで返す(他人のタスクは出ない)。プロダクトの ID と名前が付く", async () => {
    const rows = await list("", cookie);
    const names = rows.map((r) => r.taskName);
    expect(names).not.toContain("A-他人");
    expect(names).not.toContain("A-リーダー");
    expect(names).not.toContain("B-他人");
    expect(names.sort()).toEqual(["A-非表示", "A-確認待ち", "A-期限なし", "A-早い", "A-遅い", "B-1"].sort());
    const b1 = rows.find((r) => r.taskName === "B-1")!;
    expect(b1.productId).toBe(b.productId);
    expect(b1.productName).toStartWith("task-test-");
    expect(rows.find((r) => r.taskName === "A-早い")!.productId).toBe(a.productId);
  });

  it("既定では、完了したタスクは出さない。includeCompleted=true で出す", async () => {
    expect((await list("", cookie)).map((r) => r.taskName)).not.toContain("A-完了");
    expect((await list("?includeCompleted=true", cookie)).map((r) => r.taskName)).toContain("A-完了");
  });

  it("期限の昇順で、期限なしは最後", async () => {
    const names = (await list("", cookie)).map((r) => r.taskName);
    expect(names).toEqual(["A-早い", "B-1", "A-確認待ち", "A-非表示", "A-遅い", "A-期限なし"]);
  });

  it("自分が担当なら、非表示のタスクも見える", async () => {
    const row = (await list("", cookie)).find((r) => r.taskName === "A-非表示");
    expect(row?.isVisible).toBe(false);
  });

  it("productId で絞れる", async () => {
    expect((await list(`?productId=${b.productId}`, cookie)).map((r) => r.taskName)).toEqual(["B-1"]);
    expect((await list(`?productId=${a.productId}`, cookie)).every((r) => r.productId === a.productId)).toBe(true);
  });

  it("status で絞れる。status を指定したら、includeCompleted を見ない(completed だけが返る)", async () => {
    expect((await list("?status=reported", cookie)).map((r) => r.taskName)).toEqual(["A-確認待ち"]);
    expect((await list("?status=completed", cookie)).map((r) => r.taskName)).toEqual(["A-完了"]);
  });

  it("所属していないプロダクトの productId を指定しても、空(存在を漏らさない)", async () => {
    const other = await setupProduct({ members: 0 });
    expect(await list(`?productId=${other.productId}`, cookie)).toEqual([]);
  });

  it("どのプロダクトにも入っていない人は、空の配列", async () => {
    const outsider = await createOutsider();
    const res = await get("", outsider.cookie);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual([]);
  });

  it("productId が UUID でない・status が知らない値なら 422", async () => {
    expect((await get("?productId=nope", cookie)).status).toBe(422);
    expect((await get("?status=bogus", cookie)).status).toBe(422);
  });

  it("ベアラートークン(CLI のログイン)でも呼べる", async () => {
    // cookie と同じセッションを、ベアラーで渡す
    const token = decodeURIComponent(cookie.split("=")[1]!).split(".")[0]!;
    const res = await app.handle(
      new Request("http://localhost/api/me/task", { headers: { authorization: `Bearer ${token}` } }),
    );
    expect(res.status).toBe(200);
    expect(((await res.json()) as Row[]).length).toBe(6);
  });
});
