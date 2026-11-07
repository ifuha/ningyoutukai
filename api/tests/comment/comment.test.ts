import { afterAll, afterEach, beforeAll, describe, expect, spyOn, test } from "bun:test";
import { eq } from "drizzle-orm";
import { app } from "../../src/app";
import { db } from "../../src/db";
import { productComments, users } from "../../src/db/schema";
import { mailer } from "../../src/lib/mailer";
import { cleanup, createOutsider, setupProduct } from "../task/helpers";

// コメント: 作成・編集・削除はリーダーだけ、見られるのは参加者全員。作成したらメンバー権限の人にメールで知らせる(リーダーには送らない)

type Setup = Awaited<ReturnType<typeof setupProduct>>;
let a: Setup; // リーダー + メンバー 2 人
let b: Setup; // 別のプロダクト

const sendSpy = spyOn(mailer, "send");

beforeAll(async () => {
  sendSpy.mockResolvedValue({ ok: true });
  a = await setupProduct();
  b = await setupProduct({ members: 1 });
});
afterAll(cleanup);
afterEach(() => sendSpy.mockClear());

const url = (productId: string, commentId?: number) => `/api/product/${productId}/comment${commentId === undefined ? "" : `/${commentId}`}`;

function call(method: string, path: string, cookie?: string, body?: unknown) {
  const headers = new Headers();
  if (cookie) headers.set("cookie", cookie);
  if (body !== undefined) headers.set("content-type", "application/json");
  return app.handle(new Request(`http://localhost${path}`, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) }));
}

async function insertComment(productId: string, values: Partial<typeof productComments.$inferInsert> = {}) {
  const [row] = await db.insert(productComments).values({ productId, content: "既存", ...values }).returning();
  return row!;
}
const findComment = async (commentId: number) => (await db.select().from(productComments).where(eq(productComments.commentId, commentId)))[0];

describe("作成", () => {
  test("リーダーは作れる。連番の ID と作成者が入り、作成者の名前と canEdit が返る", async () => {
    const res = await call("POST", url(a.productId), a.leader.cookie, { content: "ここを見てください", x: 10, y: 20 });
    expect(res.status).toBe(201);
    const body = (await res.json()) as Record<string, unknown>;
    expect(typeof body.commentId).toBe("number");
    expect(body.createdBy).toBe(a.leader.userId);
    expect(body.content).toBe("ここを見てください");
    expect([body.x, body.y]).toEqual([10, 20]);
    expect(body.canEdit).toBe(true);
    expect((await findComment(body.commentId as number))!.createdBy).toBe(a.leader.userId);
  });

  test("メンバーは作れない(403)。保存もされず、メールも送らない", async () => {
    const before = (await db.select().from(productComments).where(eq(productComments.productId, a.productId))).length;
    const res = await call("POST", url(a.productId), a.members[0]!.cookie, { content: "x", x: 0, y: 0 });
    expect(res.status).toBe(403);
    expect((await db.select().from(productComments).where(eq(productComments.productId, a.productId))).length).toBe(before);
    expect(sendSpy).not.toHaveBeenCalled();
  });

  test("プロダクトの参加者でなければ 404", async () => {
    const outsider = await createOutsider();
    expect((await call("POST", url(a.productId), outsider.cookie, { content: "x", x: 0, y: 0 })).status).toBe(404);
  });

  test("本文が空、または 2000 文字を超えると 422(保存しない)", async () => {
    expect((await call("POST", url(a.productId), a.leader.cookie, { content: "", x: 0, y: 0 })).status).toBe(422);
    expect((await call("POST", url(a.productId), a.leader.cookie, { content: "あ".repeat(2001), x: 0, y: 0 })).status).toBe(422);
    expect((await call("POST", url(a.productId), a.leader.cookie, { content: "あ".repeat(2000), x: 0, y: 0 })).status).toBe(201);
  });

  test("ログインしていなければ 401", async () => {
    expect((await call("POST", url(a.productId), undefined, { content: "x", x: 0, y: 0 })).status).toBe(401);
  });
});

describe("メールの通知", () => {
  test("作成すると、メンバー権限の人全員に 1 通で送る。リーダーには送らない", async () => {
    await call("POST", url(a.productId), a.leader.cookie, { content: "お知らせです", x: 0, y: 0 });
    expect(sendSpy).toHaveBeenCalledTimes(1);
    const mail = sendSpy.mock.calls[0]![0];
    const to = Array.isArray(mail.to) ? mail.to : [mail.to];
    expect(to.sort()).toEqual(a.members.map((m) => m.email).sort());
    expect(to).not.toContain(a.leader.email);
    expect(mail.text).toContain("お知らせです");
    expect(mail.text).toContain(`/products/${a.productId}`);
  });

  test("本文は 200 文字までに省略する", async () => {
    await call("POST", url(a.productId), a.leader.cookie, { content: "い".repeat(300), x: 0, y: 0 });
    const text = sendSpy.mock.calls[0]![0].text;
    expect(text).toContain(`${"い".repeat(200)}…`);
    expect(text).not.toContain("い".repeat(201));
  });

  test("メールの送信が失敗しても、コメントの作成は成功する(ほかの通知と同じ)", async () => {
    sendSpy.mockResolvedValueOnce({ ok: false, error: "boom" });
    const res = await call("POST", url(a.productId), a.leader.cookie, { content: "失敗しても残る", x: 0, y: 0 });
    expect(res.status).toBe(201);
    expect((await findComment(((await res.json()) as { commentId: number }).commentId))!.content).toBe("失敗しても残る");
  });

  test("編集・削除では送らない", async () => {
    const c = await insertComment(a.productId, { createdBy: a.leader.userId });
    await call("PATCH", url(a.productId, c.commentId), a.leader.cookie, { content: "直した" });
    await call("DELETE", url(a.productId, c.commentId), a.leader.cookie);
    expect(sendSpy).not.toHaveBeenCalled();
  });

  test("メンバー権限の人がいないプロダクトでは、送らずに作成だけ成功する", async () => {
    const solo = await setupProduct({ members: 0 });
    const res = await call("POST", url(solo.productId), solo.leader.cookie, { content: "ひとり", x: 0, y: 0 });
    expect(res.status).toBe(201);
    expect(sendSpy).not.toHaveBeenCalled();
  });
});

describe("取得(参加者全員)", () => {
  test("リーダーもメンバーも見える。同じプロダクトのものだけ。canEdit はリーダーだけ true", async () => {
    const mine = await insertComment(a.productId, { createdBy: a.leader.userId });
    const other = await insertComment(b.productId, { createdBy: b.leader.userId });
    const asMember = (await (await call("GET", url(a.productId), a.members[0]!.cookie)).json()) as { commentId: number; canEdit: boolean }[];
    expect(asMember.map((c) => c.commentId)).toContain(mine.commentId);
    expect(asMember.map((c) => c.commentId)).not.toContain(other.commentId);
    expect(asMember.every((c) => c.canEdit === false)).toBe(true);
    const asLeader = (await (await call("GET", url(a.productId), a.leader.cookie)).json()) as { canEdit: boolean }[];
    expect(asLeader.length).toBe(asMember.length);
    expect(asLeader.every((c) => c.canEdit === true)).toBe(true);
  });

  test("作成者が退会していても見える(authorName と authorAvatarUrl は null)", async () => {
    const orphan = await insertComment(a.productId, { createdBy: null });
    const list = (await (await call("GET", url(a.productId), a.members[1]!.cookie)).json()) as { commentId: number; authorName: string | null; authorAvatarUrl: string | null }[];
    const found = list.find((c) => c.commentId === orphan.commentId);
    expect(found?.authorName).toBeNull();
    expect(found?.authorAvatarUrl).toBeNull();
  });

  test("作成者のアバター(users.avatarUrl)が返る。設定していなければ null", async () => {
    const c = await insertComment(a.productId, { createdBy: a.leader.userId });
    const list = async () => ((await (await call("GET", url(a.productId), a.members[0]!.cookie)).json()) as { commentId: number; authorAvatarUrl: string | null }[]).find((x) => x.commentId === c.commentId);
    expect((await list())?.authorAvatarUrl).toBeNull();
    await db.update(users).set({ avatarUrl: "https://example.com/leader.png" }).where(eq(users.userId, a.leader.userId));
    expect((await list())?.authorAvatarUrl).toBe("https://example.com/leader.png");
  });

  test("参加者でなければ 404", async () => {
    const outsider = await createOutsider();
    expect((await call("GET", url(a.productId), outsider.cookie)).status).toBe(404);
  });
});

describe("編集・削除(リーダーだけ)", () => {
  test("リーダーは本文と座標を変えられる", async () => {
    const c = await insertComment(a.productId, { createdBy: a.leader.userId });
    const res = await call("PATCH", url(a.productId, c.commentId), a.leader.cookie, { content: "直した", x: 5, y: 6 });
    expect(res.status).toBe(200);
    const row = (await findComment(c.commentId))!;
    expect([row.content, row.x, row.y]).toEqual(["直した", 5, 6]);
  });

  test("メンバーは編集も削除もできない(403)", async () => {
    const c = await insertComment(a.productId, { createdBy: a.leader.userId });
    const m = a.members[0]!;
    expect((await call("PATCH", url(a.productId, c.commentId), m.cookie, { content: "いたずら" })).status).toBe(403);
    expect((await call("DELETE", url(a.productId, c.commentId), m.cookie)).status).toBe(403);
    expect((await findComment(c.commentId))!.content).toBe("既存");
  });

  test("リーダーは、ほかのリーダーが書いたコメントも、作成者が退会したコメントも消せる", async () => {
    const orphan = await insertComment(a.productId, { createdBy: null });
    expect((await call("DELETE", url(a.productId, orphan.commentId), a.leader.cookie)).status).toBe(204);
    expect(await findComment(orphan.commentId)).toBeUndefined();
  });

  test("別のプロダクトのコメントは 404(IDOR)", async () => {
    const other = await insertComment(b.productId, { createdBy: b.leader.userId });
    expect((await call("PATCH", url(a.productId, other.commentId), a.leader.cookie, { content: "x" })).status).toBe(404);
    expect((await call("DELETE", url(a.productId, other.commentId), a.leader.cookie)).status).toBe(404);
    expect(await findComment(other.commentId)).toBeDefined();
  });

  test("存在しない ID は 404", async () => {
    expect((await call("PATCH", url(a.productId, 2147483000), a.leader.cookie, { content: "x" })).status).toBe(404);
    expect((await call("DELETE", url(a.productId, 2147483000), a.leader.cookie)).status).toBe(404);
  });
});

describe("プロダクトの削除", () => {
  test("プロダクトを消すと、コメントも一緒に消える", async () => {
    const p = await setupProduct({ members: 0 });
    const c = await insertComment(p.productId, { createdBy: p.leader.userId });
    expect((await call("DELETE", `/api/product/${p.productId}`, p.leader.cookie)).status).toBeLessThan(300);
    expect(await findComment(c.commentId)).toBeUndefined();
  });
});
