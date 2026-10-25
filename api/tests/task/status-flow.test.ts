import { afterAll, beforeEach, describe, expect, spyOn, test } from "bun:test";
import { mailer } from "../../src/lib/mailer";
import { cleanup, findTask, insertTask, request, setupProduct } from "./helpers";

/**
 * タスクの status が、完了報告(complete-report)と完了確定(complete)で正しく動くことのテスト。
 * 各ルートの個別のテスト(report-complete.test.ts / confirm-complete.test.ts)は、認可や入力を見ている。
 * ここは、状態の遷移そのもの・二重操作・同時操作・日時との整合を見る。
 */

afterAll(cleanup);

const send = spyOn(mailer, "send");
beforeEach(() => {
  send.mockClear();
  send.mockResolvedValue({ ok: true });
});

const report = (productId: string, taskId: string, cookie: string) =>
  request("POST", `/api/product/${productId}/task/${taskId}/complete-report`, { cookie });
const confirm = (productId: string, taskId: string, cookie: string) =>
  request("PATCH", `/api/product/${productId}/task/${taskId}/complete`, { cookie });

describe("報告と承認で status が変わる", () => {
  test("報告で reported、承認で completed。応答にも status が入る", async () => {
    const { productId, leader, members } = await setupProduct();
    const task = await insertTask(members[0].memberId);

    const reported = await report(productId, task.taskId, members[0].cookie);
    expect(reported.status).toBe(200);
    expect((await reported.json()).status).toBe("reported");
    let row = await findTask(task.taskId);
    expect(row.status).toBe("reported");
    expect(row.reportedAt).not.toBeNull();
    expect(row.completedAt).toBeNull();

    const confirmed = await confirm(productId, task.taskId, leader.cookie);
    expect(confirmed.status).toBe(200);
    expect((await confirmed.json()).status).toBe("completed");
    row = await findTask(task.taskId);
    expect(row.status).toBe("completed");
    expect(row.completedAt).not.toBeNull();
  });

  test("差し戻し中(rejected)の報告は再提出として通り、reportedAt は最後の報告の日時に更新される", async () => {
    const { productId, members } = await setupProduct();
    const past = new Date("2026-01-01T00:00:00Z");
    const task = await insertTask(members[0].memberId, { status: "rejected", reportedAt: past });

    const res = await report(productId, task.taskId, members[0].cookie);
    expect(res.status).toBe(200);
    const row = await findTask(task.taskId);
    expect(row.status).toBe("reported");
    expect(row.reportedAt!.getTime()).toBeGreaterThan(past.getTime());
  });
});

describe("二重の操作と、完了後の操作", () => {
  test("二重の報告は 409 で、status も reportedAt も変わらない", async () => {
    const { productId, members } = await setupProduct();
    const task = await insertTask(members[0].memberId);
    await report(productId, task.taskId, members[0].cookie);
    const first = await findTask(task.taskId);

    const again = await report(productId, task.taskId, members[0].cookie);
    expect(again.status).toBe(409);
    const after = await findTask(task.taskId);
    expect(after.status).toBe("reported");
    expect(after.reportedAt?.getTime()).toBe(first.reportedAt?.getTime());
  });

  test("完了後は、報告も承認も 409 で、status は completed のまま", async () => {
    const { productId, leader, members } = await setupProduct();
    const task = await insertTask(members[0].memberId);
    await report(productId, task.taskId, members[0].cookie);
    await confirm(productId, task.taskId, leader.cookie);
    const done = await findTask(task.taskId);

    expect((await report(productId, task.taskId, members[0].cookie)).status).toBe(409);
    expect((await confirm(productId, task.taskId, leader.cookie)).status).toBe(409);
    const after = await findTask(task.taskId);
    expect(after.status).toBe("completed");
    expect(after.completedAt?.getTime()).toBe(done.completedAt?.getTime());
  });
});

describe("同時の操作", () => {
  test("同時に 3 回報告しても、成功は 1 回だけで、メールも 1 回", async () => {
    const { productId, members } = await setupProduct();
    const task = await insertTask(members[0].memberId);

    const results = await Promise.all([
      report(productId, task.taskId, members[0].cookie),
      report(productId, task.taskId, members[0].cookie),
      report(productId, task.taskId, members[0].cookie),
    ]);
    expect(results.map((r) => r.status).sort()).toEqual([200, 409, 409]);
    expect((await findTask(task.taskId)).status).toBe("reported");
    expect(send).toHaveBeenCalledTimes(1);
  });

  test("報告と承認が同時でも、最終的な status は日時と矛盾しない", async () => {
    for (let i = 0; i < 3; i++) {
      const { productId, leader, members } = await setupProduct();
      const task = await insertTask(members[0].memberId);

      const [reported, confirmed] = await Promise.all([
        report(productId, task.taskId, members[0].cookie),
        confirm(productId, task.taskId, leader.cookie),
      ]);
      expect([200, 409]).toContain(reported.status);
      expect([200, 409]).toContain(confirmed.status);

      const row = await findTask(task.taskId);
      if (row.status === "completed") expect(row.completedAt).not.toBeNull();
      if (row.status === "reported") {
        expect(row.completedAt).toBeNull();
        expect(row.reportedAt).not.toBeNull();
      }
      // 報告が成功したなら reportedAt がある。承認が成功したなら completed になっている
      if (reported.status === 200) expect(row.reportedAt).not.toBeNull();
      if (confirmed.status === 200) expect(row.status).toBe("completed");
    }
  });
});

describe("権限のない操作は、status を変えない", () => {
  test("担当者でない人(リーダーを含む)は報告できない", async () => {
    const { productId, leader, members } = await setupProduct();
    const task = await insertTask(members[0].memberId);

    expect((await report(productId, task.taskId, leader.cookie)).status).toBe(403);
    expect((await report(productId, task.taskId, members[1].cookie)).status).toBe(403);
    expect((await findTask(task.taskId)).status).toBe("in_progress");
  });

  test("リーダーでないメンバーは承認できない", async () => {
    const { productId, members } = await setupProduct();
    const task = await insertTask(members[0].memberId, { status: "reported", reportedAt: new Date() });

    expect((await confirm(productId, task.taskId, members[0].cookie)).status).toBe(403);
    expect((await findTask(task.taskId)).status).toBe("reported");
  });
});

// v1 の挙動を、そのまま維持している部分。設計の遷移表(docs/v2.0/message-feature.md の 2 章)とは違う。
// 承認の API で、未報告・差し戻し中のタスクを直接完了にできるかは、未決定(同文書の Q17)。
// 案は「v2.0 では報告済み(reported)のときだけ」。決まったら、このテストを書き換える。
describe("v1 の挙動の維持(Q17 が未決定)", () => {
  test("未報告(in_progress)のタスクを、リーダーが承認の API で直接完了にできる。reportedAt は空のまま", async () => {
    const { productId, leader, members } = await setupProduct();
    const task = await insertTask(members[0].memberId);

    const res = await confirm(productId, task.taskId, leader.cookie);
    expect(res.status).toBe(200);
    const row = await findTask(task.taskId);
    expect(row.status).toBe("completed");
    expect(row.completedAt).not.toBeNull();
    expect(row.reportedAt).toBeNull();
  });

  test("差し戻し中(rejected)のタスクも、承認の API で直接完了にできる", async () => {
    const { productId, leader, members } = await setupProduct();
    const task = await insertTask(members[0].memberId, { status: "rejected", reportedAt: new Date() });

    const res = await confirm(productId, task.taskId, leader.cookie);
    expect(res.status).toBe(200);
    expect((await findTask(task.taskId)).status).toBe("completed");
  });
});
