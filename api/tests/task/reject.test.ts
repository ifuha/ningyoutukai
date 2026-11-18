import { afterAll, afterEach, beforeEach, describe, expect, spyOn, test } from "bun:test";
import { eq } from "drizzle-orm";
import { db } from "../../src/db";
import { taskMessages } from "../../src/db/schema";
import { mailer } from "../../src/lib/mailer";
import {
  cleanup,
  createOutsider,
  findTask,
  insertTask,
  request,
  setupProduct,
} from "./helpers";

afterAll(cleanup);

const send = spyOn(mailer, "send");
beforeEach(() => {
  send.mockClear();
  send.mockResolvedValue({ ok: true });
});
afterEach(() => send.mockClear());

const url = (productId: string, taskId: string) =>
  `/api/product/${productId}/task/${taskId}/reject`;

const messagesOf = async (taskId: string) =>
  db.select().from(taskMessages).where(eq(taskMessages.taskId, taskId));

describe("POST /api/product/:productId/task/:taskId/reject", () => {
  describe("認証・権限", () => {
    test("cookie なしは 401", async () => {
      const { productId, members } = await setupProduct();
      const task = await insertTask(members[0]!.memberId, { reportedAt: new Date() });
      const res = await request("POST", url(productId, task.taskId), { body: { body: "直して" } });
      expect(res.status).toBe(401);
      expect((await findTask(task.taskId))!.status).toBe("reported");
    });

    test("所属していないユーザーは 404", async () => {
      const { productId, members } = await setupProduct();
      const task = await insertTask(members[0]!.memberId, { reportedAt: new Date() });
      const outsider = await createOutsider();
      const res = await request("POST", url(productId, task.taskId), {
        cookie: outsider.cookie,
        body: { body: "直して" },
      });
      expect(res.status).toBe(404);
      expect((await findTask(task.taskId))!.status).toBe("reported");
    });

    test("メンバーは 403(担当者本人でも)", async () => {
      const { productId, members } = await setupProduct();
      const task = await insertTask(members[0]!.memberId, { reportedAt: new Date() });
      const res = await request("POST", url(productId, task.taskId), {
        cookie: members[0]!.cookie,
        body: { body: "直して" },
      });
      expect(res.status).toBe(403);
      expect(await res.json()).toEqual({ message: "プロダクトリーダーのみ差し戻せます" });
      expect((await findTask(task.taskId))!.status).toBe("reported");
      expect(send).not.toHaveBeenCalled();
    });

    test("存在しない taskId は 404", async () => {
      const { productId, leader } = await setupProduct();
      const res = await request("POST", url(productId, crypto.randomUUID()), {
        cookie: leader.cookie,
        body: { body: "直して" },
      });
      expect(res.status).toBe(404);
    });

    test("別プロダクトのタスクは 404 で、状態は変わらない", async () => {
      const a = await setupProduct();
      const b = await setupProduct();
      const otherTask = await insertTask(b.members[0]!.memberId, { reportedAt: new Date() });
      const res = await request("POST", url(a.productId, otherTask.taskId), {
        cookie: a.leader.cookie,
        body: { body: "直して" },
      });
      expect(res.status).toBe(404);
      expect((await findTask(otherTask.taskId))!.status).toBe("reported");
      expect(await messagesOf(otherTask.taskId)).toHaveLength(0);
    });

    test("productId / taskId が uuid でなければ 422", async () => {
      const { leader } = await setupProduct();
      expect(
        (await request("POST", url("not-a-uuid", crypto.randomUUID()), {
          cookie: leader.cookie,
          body: { body: "直して" },
        })).status
      ).toBe(422);
      const { productId } = await setupProduct();
      expect(
        (await request("POST", url(productId, "not-a-uuid"), {
          cookie: leader.cookie,
          body: { body: "直して" },
        })).status
      ).toBe(422);
    });
  });

  describe("本文(必須)", () => {
    test("本文なしは 422(スキーマで弾く)で、状態もログも変わらない", async () => {
      const { productId, leader, members } = await setupProduct();
      const task = await insertTask(members[0]!.memberId, { reportedAt: new Date() });
      const res = await request("POST", url(productId, task.taskId), { cookie: leader.cookie });
      expect(res.status).toBe(422);
      expect((await findTask(task.taskId))!.status).toBe("reported");
      expect(await messagesOf(task.taskId)).toHaveLength(0);
      expect(send).not.toHaveBeenCalled();
    });

    test("空白だけの本文は 400", async () => {
      const { productId, leader, members } = await setupProduct();
      const task = await insertTask(members[0]!.memberId, { reportedAt: new Date() });
      const res = await request("POST", url(productId, task.taskId), {
        cookie: leader.cookie,
        body: { body: "   \n  " },
      });
      expect(res.status).toBe(400);
      expect((await findTask(task.taskId))!.status).toBe("reported");
    });

    test("2000 字を超えると 422", async () => {
      const { productId, leader, members } = await setupProduct();
      const task = await insertTask(members[0]!.memberId, { reportedAt: new Date() });
      const res = await request("POST", url(productId, task.taskId), {
        cookie: leader.cookie,
        body: { body: "あ".repeat(2001) },
      });
      expect(res.status).toBe(422);
      expect((await findTask(task.taskId))!.status).toBe("reported");
      expect(await messagesOf(task.taskId)).toHaveLength(0);
    });
  });

  describe("差し戻しの実行", () => {
    test("リーダーが差し戻せ、状態が rejected になり「差し戻し」のログが残る", async () => {
      const { productId, leader, members } = await setupProduct();
      const reportedAt = new Date("2030-04-05T06:07:08.000Z");
      const task = await insertTask(members[0]!.memberId, { reportedAt });

      const res = await request("POST", url(productId, task.taskId), {
        cookie: leader.cookie,
        body: { body: "ログインの失敗が直っていないので、直して再提出して" },
      });
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.status).toBe("rejected");
      // reportedAt は「最後に報告した日時」なので、差し戻しても変えない
      expect(body.reportedAt).toBe(reportedAt.toISOString());

      const row = (await findTask(task.taskId))!;
      expect(row.status).toBe("rejected");
      expect(row.reportedAt!.toISOString()).toBe(reportedAt.toISOString());
      expect(row.completedAt).toBeNull();

      const rows = await messagesOf(task.taskId);
      expect(rows).toHaveLength(1);
      expect(rows[0]).toMatchObject({
        kind: "reject",
        body: "ログインの失敗が直っていないので、直して再提出して",
        authorMemberId: leader.memberId,
      });
    });

    test("差し戻したあと、担当者が再提出すると「再提出」で残る", async () => {
      const { productId, leader, members } = await setupProduct();
      const task = await insertTask(members[0]!.memberId, { reportedAt: new Date() });
      await request("POST", url(productId, task.taskId), {
        cookie: leader.cookie,
        body: { body: "直して" },
      });
      const res = await request("POST", `/api/product/${productId}/task/${task.taskId}/complete-report`, {
        cookie: members[0]!.cookie,
        body: { body: "直しました" },
      });
      expect(res.status).toBe(200);
      const rows = await messagesOf(task.taskId);
      expect(rows.map((r) => r.kind)).toEqual(["reject", "resubmit"]);
      expect((await findTask(task.taskId))!.status).toBe("reported");
    });

    test("確認待ち以外は 409(作業中・差し戻し中・完了)", async () => {
      const { productId, leader, members } = await setupProduct();
      const cases = [
        { task: await insertTask(members[0]!.memberId), message: "まだ報告されていない" },
        {
          task: await insertTask(members[0]!.memberId, {
            status: "rejected",
            reportedAt: new Date(),
          }),
          message: "すでに差し戻している",
        },
        { task: await insertTask(members[0]!.memberId, { completedAt: new Date() }), message: "完了済み" },
      ];
      for (const c of cases) {
        const res = await request("POST", url(productId, c.task.taskId), {
          cookie: leader.cookie,
          body: { body: "差し戻す" },
        });
        expect(res.status).toBe(409);
        expect(await messagesOf(c.task.taskId)).toHaveLength(0);
      }
      expect(send).not.toHaveBeenCalled();
    });

    test("二重に差し戻しても 2 回目は 409 で、ログは 1 件のまま", async () => {
      const { productId, leader, members } = await setupProduct();
      const task = await insertTask(members[0]!.memberId, { reportedAt: new Date() });
      const first = await request("POST", url(productId, task.taskId), {
        cookie: leader.cookie,
        body: { body: "1 回目" },
      });
      expect(first.status).toBe(200);
      const second = await request("POST", url(productId, task.taskId), {
        cookie: leader.cookie,
        body: { body: "2 回目" },
      });
      expect(second.status).toBe(409);
      const rows = await messagesOf(task.taskId);
      expect(rows).toHaveLength(1);
      expect(rows[0]!.body).toBe("1 回目");
    });
  });

  describe("メール通知", () => {
    test("担当者に 1 通送られ、理由とリンクが入る", async () => {
      const { productId, leader, members } = await setupProduct();
      const task = await insertTask(members[1]!.memberId, {
        taskName: "トップページ",
        reportedAt: new Date(),
      });
      await request("POST", url(productId, task.taskId), {
        cookie: leader.cookie,
        body: { body: "余白が潰れているので直して" },
      });
      expect(send).toHaveBeenCalledTimes(1);
      const mail = send.mock.calls[0]![0];
      expect(mail.to).toBe(members[1]!.email);
      expect(mail.subject).toBe("タスクが差し戻されました: トップページ");
      expect(mail.text).toContain("余白が潰れているので直して");
      expect(mail.text).toContain(`/products/${productId}`);
    });

    test("送信が失敗しても API は 200 のまま", async () => {
      send.mockResolvedValue({ ok: false, error: "boom" });
      const { productId, leader, members } = await setupProduct();
      const task = await insertTask(members[0]!.memberId, { reportedAt: new Date() });
      const res = await request("POST", url(productId, task.taskId), {
        cookie: leader.cookie,
        body: { body: "直して" },
      });
      expect(res.status).toBe(200);
      expect((await findTask(task.taskId))!.status).toBe("rejected");
    });
  });
});
