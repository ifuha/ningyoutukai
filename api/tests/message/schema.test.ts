import { afterAll, describe, expect, test } from "bun:test";
import { eq } from "drizzle-orm";
import { db } from "../../src/db";
import { productMembers, taskMessages, tasks } from "../../src/db/schema";
import { cleanup, findTask, insertTask, setupProduct } from "../task/helpers";

/**
 * task_messages と tasks.status の、DB の制約のテスト。
 * 本文の長さ・空のコメント・status と日時の整合は、DB では守らない(ルートで検証する)。
 */

afterAll(cleanup);

const ZERO = "00000000-0000-0000-0000-000000000000";

/** Postgres のエラーコード(drizzle は、元のエラーを cause に入れて包む) */
async function pgCode(run: () => Promise<unknown>): Promise<string | undefined> {
  try {
    await run();
  } catch (e) {
    const err = e as { code?: string; cause?: { code?: string } };
    return err.cause?.code ?? err.code ?? "unknown";
  }
  return undefined;
}

const insertMessage = (values: Partial<typeof taskMessages.$inferInsert> & { taskId: string; authorMemberId: string }) =>
  db.insert(taskMessages).values({ kind: "comment", ...values } as typeof taskMessages.$inferInsert).returning();

const FOREIGN_KEY_VIOLATION = "23503";
const CHECK_VIOLATION = "23514";
const NOT_NULL_VIOLATION = "23502";

describe("task_messages", () => {
  test("正しい kind のメッセージは入る(5 種類すべて)", async () => {
    const { members } = await setupProduct();
    const task = await insertTask(members[0].memberId);
    for (const kind of ["comment", "report", "resubmit", "reject", "approve"] as const) {
      const [row] = await insertMessage({ taskId: task.taskId, authorMemberId: members[0].memberId, kind, body: "x" });
      expect(row.kind).toBe(kind);
    }
  });

  test("kind の不正な値は、CHECK で拒否される", async () => {
    const { members } = await setupProduct();
    const task = await insertTask(members[0].memberId);
    const code = await pgCode(() =>
      insertMessage({ taskId: task.taskId, authorMemberId: members[0].memberId, kind: "bogus" as never })
    );
    expect(code).toBe(CHECK_VIOLATION);
  });

  test("存在しないタスクへのメッセージは、外部キーで拒否される", async () => {
    const { members } = await setupProduct();
    const code = await pgCode(() => insertMessage({ taskId: ZERO, authorMemberId: members[0].memberId }));
    expect(code).toBe(FOREIGN_KEY_VIOLATION);
  });

  test("存在しないメンバーが書いたメッセージは、外部キーで拒否される", async () => {
    const { members } = await setupProduct();
    const task = await insertTask(members[0].memberId);
    const code = await pgCode(() => insertMessage({ taskId: task.taskId, authorMemberId: ZERO }));
    expect(code).toBe(FOREIGN_KEY_VIOLATION);
  });

  test("タスクを消すと、そのメッセージも消える", async () => {
    const { members } = await setupProduct();
    const task = await insertTask(members[0].memberId);
    await insertMessage({ taskId: task.taskId, authorMemberId: members[0].memberId, body: "a" });
    await insertMessage({ taskId: task.taskId, authorMemberId: members[1].memberId, body: "b" });

    await db.delete(tasks).where(eq(tasks.taskId, task.taskId));
    const left = await db.select().from(taskMessages).where(eq(taskMessages.taskId, task.taskId));
    expect(left).toHaveLength(0);
  });

  test("メンバーを消すと、そのメンバーが書いたメッセージも消える(ほかの人のものは残る)", async () => {
    const { members } = await setupProduct();
    // 消されるメンバー(members[1])のタスクではなく、members[0] のタスクに 2 人が書く
    const task = await insertTask(members[0].memberId);
    await insertMessage({ taskId: task.taskId, authorMemberId: members[0].memberId, body: "残る" });
    await insertMessage({ taskId: task.taskId, authorMemberId: members[1].memberId, body: "消える" });

    await db.delete(productMembers).where(eq(productMembers.productMemberId, members[1].memberId));
    const left = await db.select().from(taskMessages).where(eq(taskMessages.taskId, task.taskId));
    expect(left.map((m) => m.body)).toEqual(["残る"]);
  });

  test("author_member_id の索引がある(メンバー削除の連鎖が全件走査にならない)", async () => {
    const rows = await db.$client.query(
      "select indexname from pg_indexes where tablename = 'task_messages' and indexname = 'task_messages_author_idx'"
    );
    expect(rows.rowCount).toBe(1);
  });
});

describe("tasks.status", () => {
  test("不正な値は、CHECK で拒否される", async () => {
    const { members } = await setupProduct();
    const task = await insertTask(members[0].memberId);
    const code = await pgCode(() =>
      db.update(tasks).set({ status: "bogus" as never }).where(eq(tasks.taskId, task.taskId))
    );
    expect(code).toBe(CHECK_VIOLATION);
    expect((await findTask(task.taskId)).status).toBe("in_progress");
  });

  test("NULL は拒否される", async () => {
    const { members } = await setupProduct();
    const task = await insertTask(members[0].memberId);
    const code = await pgCode(() =>
      db.update(tasks).set({ status: null as never }).where(eq(tasks.taskId, task.taskId))
    );
    expect(code).toBe(NOT_NULL_VIOLATION);
  });

  test("指定しなければ in_progress になる(新しいタスクの初期値)", async () => {
    const { members } = await setupProduct();
    const [row] = await db
      .insert(tasks)
      .values({ taskName: "初期値", productMemberId: members[0].memberId })
      .returning();
    expect(row.status).toBe("in_progress");
  });
});
