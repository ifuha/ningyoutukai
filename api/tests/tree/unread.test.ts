import { afterAll, beforeAll, describe, expect, it } from "bun:test";
import { eq } from "drizzle-orm";
import { Elysia } from "elysia";
import { db } from "../../src/db";
import { taskReads } from "../../src/db/schema";
import { productTreeRoutes } from "../../src/routes/product-tree";
import {
  cleanup,
  createOutsider,
  insertTask,
  request,
  setupProduct,
} from "../task/helpers";

// 未読のやりとり(ツリーの unreadCount)と、既読にする API(POST …/task/:taskId/read)
// コメントはメールで送らない(無料枠のため)ので、未読はここでしか知らせない

const treeApp = new Elysia().use(productTreeRoutes);
type Setup = Awaited<ReturnType<typeof setupProduct>>;
let p: Setup;
/**未読を数える対象のタスク(メンバー1が担当) */
let task: Awaited<ReturnType<typeof insertTask>>;

beforeAll(async () => {
  p = await setupProduct({ members: 2 });
  task = await insertTask(p.members[0]!.memberId, { taskName: "未読のタスク" });
});
afterAll(cleanup);

/** ツリーを取得する */
async function tree(cookie: string) {
  const res = await treeApp.handle(
    new Request(`http://localhost/api/product/${p.productId}/tree`, {
      headers: { cookie },
    }),
  );
  expect(res.status).toBe(200);
  return await res.json();
}

/** この閲覧者から見た、タスク 1 件の未読件数(ツリーに無ければ undefined) */
async function unread(cookie: string, taskId: string) {
  const t = await tree(cookie);
  const all = [t.leader, ...t.members].flatMap(
    (m: { tasks: { taskId: string; unreadCount: number }[] }) => m.tasks,
  );
  return all.find((x) => x.taskId === taskId)?.unreadCount;
}

/** タスクにやりとりを 1 件残す(コメントを書けるのはリーダーと担当者) */
async function comment(cookie: string, taskId: string, body: string) {
  const res = await request(
    "POST",
    `/api/product/${p.productId}/task/${taskId}/message`,
    { cookie, body: { body } },
  );
  expect(res.status).toBe(201);
}

const readUrl = (taskId: string) => `/api/product/${p.productId}/task/${taskId}/read`;
const markRead = (taskId: string, cookie?: string) =>
  request("POST", readUrl(taskId), { cookie });

describe("未読のやりとり", () => {
  it("一度も開いていないタスクは、自分以外のやりとりが全部未読", async () => {
    await comment(p.members[0]!.cookie, task.taskId, "担当者が書いたコメント");
    // リーダーから見ると、担当者のやりとりは未読
    expect(await unread(p.leader.cookie, task.taskId)).toBe(1);
    // 担当者本人のやつは、自分には未読にならない
    expect(await unread(p.members[0]!.cookie, task.taskId)).toBe(0);
  });

  it("リーダーのやりとりは担当者にとって未読。開くと 0 になる", async () => {
    await comment(p.leader.cookie, task.taskId, "確認をお願いします");
    expect(await unread(p.members[0]!.cookie, task.taskId)).toBe(1);

    expect((await markRead(task.taskId, p.members[0]!.cookie)).status).toBe(204);
    expect(await unread(p.members[0]!.cookie, task.taskId)).toBe(0);
    // リーダーはまだ開いていないので、担当者のやりとりは未読のまま
    expect(await unread(p.leader.cookie, task.taskId)).toBe(1);
  });

  it("既読にしたあとに来たら、また未読になる", async () => {
    await comment(p.leader.cookie, task.taskId, "追加のやりとり");
    expect(await unread(p.members[0]!.cookie, task.taskId)).toBe(1);
    expect((await markRead(task.taskId, p.members[0]!.cookie)).status).toBe(204);
    expect(await unread(p.members[0]!.cookie, task.taskId)).toBe(0);
  });

  it("削除したコメントは数えない", async () => {
    const before = await unread(p.leader.cookie, task.taskId);
    const res = await request(
      "POST",
      `/api/product/${p.productId}/task/${task.taskId}/message`,
      { cookie: p.members[0]!.cookie, body: { body: "消えるコメント" } },
    );
    expect(res.status).toBe(201);
    expect(await unread(p.leader.cookie, task.taskId)).toBe((before ?? 0) + 1);

    const del = await request(
      "DELETE",
      `/api/product/${p.productId}/task/${task.taskId}/message/${(await res.json()).messageId}`,
      { cookie: p.members[0]!.cookie },
    );
    expect(del.status).toBe(204);
    expect(await unread(p.leader.cookie, task.taskId)).toBe(before);
  });

  it("メンバーは、開けないタスク(他人のタスク)の未読を数えない(点が消せないため)", async () => {
    const other = await insertTask(p.members[1]!.memberId, {
      taskName: "他人の公開タスク",
    });
    // 担当者(メンバー2)のやりとり。リーダーには未読、開けないメンバー1 には数えない
    await comment(p.members[1]!.cookie, other.taskId, "公開タスクへのやりとり");

    // リーダーは全部開けるので、そのタスクの未読は見える
    expect(await unread(p.leader.cookie, other.taskId)).toBe(1);
    // メンバー1 は開けない(タスクの詳細を開けないので)→ 数えない
    expect(await unread(p.members[0]!.cookie, other.taskId)).toBe(0);
  });
});

describe("既読にする API", () => {
  it("204 で、最後に開いた日時が DB に入る(2 回目は更新される)", async () => {
    const t = await insertTask(p.members[1]!.memberId, { taskName: "既読のタスク" });
    const first = await markRead(t.taskId, p.members[1]!.cookie);
    expect(first.status).toBe(204);
    expect(await first.text()).toBe("");

    const rows = async () =>
      db.select().from(taskReads).where(eq(taskReads.taskId, t.taskId));
    const [row1] = await rows();
    expect(row1?.memberId).toBe(p.members[1]!.memberId);

    await new Promise((r) => setTimeout(r, 5));
    const second = await markRead(t.taskId, p.members[1]!.cookie);
    expect(second.status).toBe(204);
    const stored = await rows();
    expect(stored).toHaveLength(1);
    expect(stored[0]!.lastReadAt.getTime()).toBeGreaterThanOrEqual(row1!.lastReadAt.getTime());
  });

  it("cookie なしは 401", async () => {
    expect((await markRead(task.taskId)).status).toBe(401);
  });

  it("所属していないユーザーは 404", async () => {
    const outsider = await createOutsider();
    expect((await markRead(task.taskId, outsider.cookie)).status).toBe(404);
  });

  it("別のプロダクトのタスクは 404(存在しない扱い)", async () => {
    const other = await setupProduct({ members: 0 });
    const otherTask = await insertTask(other.leader.memberId);
    const res = await request("POST", readUrl(otherTask.taskId), {
      cookie: p.leader.cookie,
    });
    expect(res.status).toBe(404);
    // メンバーが見られないタスク(他人の非公開)も 404
    const hidden = await insertTask(p.members[1]!.memberId, {
      taskName: "他人の非公開",
      isVisible: false,
    });
    expect((await markRead(hidden.taskId, p.members[0]!.cookie)).status).toBe(404);
    // リーダーは見られるので通る
    expect((await markRead(hidden.taskId, p.leader.cookie)).status).toBe(204);
  });

  it("taskId が uuid でないと 422", async () => {
    expect((await markRead("x", p.leader.cookie)).status).toBe(422);
  });
});
