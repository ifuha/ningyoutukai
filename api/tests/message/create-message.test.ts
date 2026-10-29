import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { eq } from "drizzle-orm";
import { db } from "../../src/db";
import { taskMessages } from "../../src/db/schema";
import {
  cleanup,
  createOutsider,
  insertTask,
  request,
  setupProduct,
} from "../task/helpers";

type Setup = Awaited<ReturnType<typeof setupProduct>>;
let a: Setup; // 検査の対象のプロダクト(リーダー + メンバー 2 人)
let b: Setup; // 別のプロダクト

beforeAll(async () => {
  a = await setupProduct();
  b = await setupProduct({ members: 1 });
});
afterAll(cleanup);

const url = (productId: string, taskId: string) =>
  `/api/product/${productId}/task/${taskId}/message`;

const post = (cookie: string | undefined, productId: string, taskId: string, body?: unknown) =>
  request("POST", url(productId, taskId), { cookie, body });

const rows = (taskId: string) =>
  db.select().from(taskMessages).where(eq(taskMessages.taskId, taskId));

describe("認証・存在・権限", () => {
  test("cookie なしは 401 で、何も作られない", async () => {
    const task = await insertTask(a.members[0]!.memberId);
    const res = await post(undefined, a.productId, task.taskId, { body: "x" });
    expect(res.status).toBe(401);
    expect(await rows(task.taskId)).toHaveLength(0);
  });

  test("所属していないユーザーは 404", async () => {
    const outsider = await createOutsider();
    const task = await insertTask(a.members[0]!.memberId);
    const res = await post(outsider.cookie, a.productId, task.taskId, { body: "x" });
    expect(res.status).toBe(404);
    expect(await rows(task.taskId)).toHaveLength(0);
  });

  test("存在しないタスク、別プロダクトのタスクは 404", async () => {
    const missing = await post(a.leader.cookie, a.productId, crypto.randomUUID(), { body: "x" });
    expect(missing.status).toBe(404);
    const other = await insertTask(b.members[0]!.memberId);
    const res = await post(a.leader.cookie, a.productId, other.taskId, { body: "x" });
    expect(res.status).toBe(404);
    expect(await rows(other.taskId)).toHaveLength(0);
  });

  test("uuid でない taskId は 422", async () => {
    const res = await post(a.leader.cookie, a.productId, "x", { body: "x" });
    expect(res.status).toBe(422);
  });

  test("見えない非公開タスクは 404(403 ではない)。担当者でもリーダーでもないため", async () => {
    const task = await insertTask(a.members[0]!.memberId, { isVisible: false });
    const res = await post(a.members[1]!.cookie, a.productId, task.taskId, { body: "x" });
    expect(res.status).toBe(404);
    expect(await rows(task.taskId)).toHaveLength(0);
  });

  test("見える公開タスクでも、担当者でもリーダーでもないメンバーは 403 で、何も作られない", async () => {
    const task = await insertTask(a.members[0]!.memberId, { isVisible: true });
    const res = await post(a.members[1]!.cookie, a.productId, task.taskId, { body: "x" });
    expect(res.status).toBe(403);
    expect(await res.json()).toEqual({ message: "リーダーと担当者のみコメントを書けます" });
    expect(await rows(task.taskId)).toHaveLength(0);
  });

  test("権限の確認が先: 書けないメンバーが空白だけを送っても 403", async () => {
    const task = await insertTask(a.members[0]!.memberId);
    const res = await post(a.members[1]!.cookie, a.productId, task.taskId, { body: "   " });
    expect(res.status).toBe(403);
  });
});

describe("書ける人と、作られるもの", () => {
  test("担当者は 201 で書ける。応答の形と、DB の行", async () => {
    const task = await insertTask(a.members[0]!.memberId);
    const res = await post(a.members[0]!.cookie, a.productId, task.taskId, { body: "確認お願いします" });
    expect(res.status).toBe(201);
    const json = await res.json();
    expect(Object.keys(json).sort()).toEqual([
      "author",
      "body",
      "createdAt",
      "deleted",
      "editedAt",
      "kind",
      "messageId",
    ]);
    expect(json).toMatchObject({
      kind: "comment",
      body: "確認お願いします",
      editedAt: null,
      deleted: false,
    });
    expect(json.author).toMatchObject({
      productMemberId: a.members[0]!.memberId,
      userName: "member1",
      avatarUrl: null,
    });
    expect(new Date(json.createdAt).toISOString()).toBe(json.createdAt);

    const [row] = await rows(task.taskId);
    expect(row).toMatchObject({
      messageId: json.messageId,
      taskId: task.taskId,
      authorMemberId: a.members[0]!.memberId,
      kind: "comment",
      body: "確認お願いします",
      editedAt: null,
      deletedAt: null,
    });
  });

  test("リーダーは、ほかの人が担当のタスクにも、自分が担当のタスクにも書ける", async () => {
    const others = await insertTask(a.members[0]!.memberId, { isVisible: false });
    const own = await insertTask(a.leader.memberId);
    expect((await post(a.leader.cookie, a.productId, others.taskId, { body: "a" })).status).toBe(201);
    expect((await post(a.leader.cookie, a.productId, own.taskId, { body: "b" })).status).toBe(201);
  });

  test("作業中・確認待ち・差し戻し中のタスクには書ける", async () => {
    for (const status of ["in_progress", "reported", "rejected"] as const) {
      const task = await insertTask(a.members[0]!.memberId, { status });
      const res = await post(a.members[0]!.cookie, a.productId, task.taskId, { body: status });
      expect(res.status).toBe(201);
    }
  });

  test("追加したコメントが、履歴取得(GET)に出る", async () => {
    const task = await insertTask(a.members[0]!.memberId);
    await post(a.members[0]!.cookie, a.productId, task.taskId, { body: "1つ目" });
    await post(a.leader.cookie, a.productId, task.taskId, { body: "2つ目" });
    const res = await request("GET", url(a.productId, task.taskId), { cookie: a.leader.cookie });
    const bodies = (await res.json()).messages.map((m: { body: string }) => m.body);
    expect(bodies).toEqual(["1つ目", "2つ目"]);
  });

  test("本文以外の項目(kind、authorMemberId、taskId など)を送っても無視される", async () => {
    const task = await insertTask(a.members[0]!.memberId);
    const res = await post(a.members[0]!.cookie, a.productId, task.taskId, {
      body: "なりすまし",
      kind: "approve",
      authorMemberId: a.leader.memberId,
      taskId: crypto.randomUUID(),
      deletedAt: new Date().toISOString(),
    });
    expect(res.status).toBe(201);
    const [row] = await rows(task.taskId);
    expect(row).toMatchObject({
      kind: "comment",
      authorMemberId: a.members[0]!.memberId,
      taskId: task.taskId,
      deletedAt: null,
    });
  });

  test("同時に 5 件送っても、5 件とも作られる", async () => {
    const task = await insertTask(a.members[0]!.memberId);
    const rs = await Promise.all(
      Array.from({ length: 5 }, (_, i) =>
        post(a.members[0]!.cookie, a.productId, task.taskId, { body: `同時${i}` })
      )
    );
    expect(rs.map((r) => r.status)).toEqual([201, 201, 201, 201, 201]);
    expect(await rows(task.taskId)).toHaveLength(5);
  });
});

describe("完了済みのタスク", () => {
  test("完了済みは 409 で、何も作られない", async () => {
    const task = await insertTask(a.members[0]!.memberId, { completedAt: new Date() });
    for (const who of [a.leader, a.members[0]!]) {
      const res = await post(who.cookie, a.productId, task.taskId, { body: "x" });
      expect(res.status).toBe(409);
      expect(await res.json()).toEqual({ message: "完了済みのタスクにはコメントを書けません" });
    }
    expect(await rows(task.taskId)).toHaveLength(0);
  });
});

describe("本文の検証", () => {
  test("前後の空白は取り除かれ、途中の空白と改行は保たれる", async () => {
    const task = await insertTask(a.members[0]!.memberId);
    const res = await post(a.members[0]!.cookie, a.productId, task.taskId, {
      body: "  \u3000 一行目\n二行目  あり \t\n",
    });
    expect(res.status).toBe(201);
    expect((await res.json()).body).toBe("一行目\n二行目  あり");
  });

  test("空・空白だけ(全角スペース、タブ、改行を含む)は 400 で、何も作られない", async () => {
    const task = await insertTask(a.members[0]!.memberId);
    for (const body of ["", "   ", "\u3000\u3000", "\t\n ", "\r\n"]) {
      const res = await post(a.members[0]!.cookie, a.productId, task.taskId, { body });
      expect(res.status).toBe(400);
      expect(await res.json()).toEqual({ message: "コメントを入力してください" });
    }
    expect(await rows(task.taskId)).toHaveLength(0);
  });

  test("body がない、型が違う、本文が配列・null・文字列は 422", async () => {
    const task = await insertTask(a.members[0]!.memberId);
    for (const body of [{}, { body: 123 }, { body: null }, { body: ["x"] }, [], "x", null]) {
      const res = await post(a.members[0]!.cookie, a.productId, task.taskId, body);
      expect(res.status).toBe(422);
    }
    expect(await rows(task.taskId)).toHaveLength(0);
  });

  test("2000 文字ちょうどは 201、2001 文字は 422", async () => {
    const task = await insertTask(a.members[0]!.memberId);
    const ok = await post(a.members[0]!.cookie, a.productId, task.taskId, { body: "あ".repeat(2000) });
    expect(ok.status).toBe(201);
    const ng = await post(a.members[0]!.cookie, a.productId, task.taskId, { body: "あ".repeat(2001) });
    expect(ng.status).toBe(422);
    expect(await rows(task.taskId)).toHaveLength(1);
  });

  test("上限は trim 前の長さで判定される(前後の空白込みで 2001 文字は 422)", async () => {
    const task = await insertTask(a.members[0]!.memberId);
    const res = await post(a.members[0]!.cookie, a.productId, task.taskId, {
      body: " " + "あ".repeat(2000),
    });
    expect(res.status).toBe(422);
  });

  test("NUL 文字を含むと 422 で、500 にならず、何も作られない", async () => {
    const task = await insertTask(a.members[0]!.memberId);
    for (const body of ["\u0000先頭", "途中\u0000です", "末尾\u0000"]) {
      const res = await post(a.members[0]!.cookie, a.productId, task.taskId, { body });
      expect(res.status).toBe(422);
    }
    expect(await rows(task.taskId)).toHaveLength(0);
  });

  test("絵文字・SQL 風・HTML 風の文字列は、そのまま保存される", async () => {
    const task = await insertTask(a.members[0]!.memberId);
    const text = "👍 '; DROP TABLE tasks; -- <script>alert(1)</script>";
    const res = await post(a.members[0]!.cookie, a.productId, task.taskId, { body: text });
    expect(res.status).toBe(201);
    expect((await res.json()).body).toBe(text);
  });
});