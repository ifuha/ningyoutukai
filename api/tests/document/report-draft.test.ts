import { afterAll, afterEach, beforeAll, describe, expect, spyOn, test } from "bun:test";
import { eq } from "drizzle-orm";
import { app } from "../../src/app";
import { db } from "../../src/db";
import { aiTokens, taskMessages, taskReportDrafts, tasks } from "../../src/db/schema";
import { createAiToken } from "../../src/lib/ai-token";
import { mailer } from "../../src/lib/mailer";
import { createMemoryStorage, setDefaultDocumentStorage } from "../../src/lib/storage";
import { cleanup, setupProduct } from "../task/helpers";

// AI からの報告の下書き: AI が保存し、担当者が確認して、完了報告に出す(または却下する)

type Setup = Awaited<ReturnType<typeof setupProduct>>;
let a: Setup; // リーダー + メンバー 2 人
let dirId: string;
let docId: string;
let otherDocId: string;
let ai0: string; // members[0] の AI(名前: "Claude Code")
let ai1: string; // members[1] の AI
let tokenId0: string;
const sendSpy = spyOn(mailer, "send");

beforeAll(async () => {
  setDefaultDocumentStorage(createMemoryStorage());
  sendSpy.mockResolvedValue({ ok: true });
  a = await setupProduct({ members: 2 });
  dirId = ((await (await call("POST", `/api/product/${a.productId}/directory`, { cookie: a.leader.cookie }, { name: "仕様" })).json()) as { directoryId: string }).directoryId;
  docId = (await createDoc("spec.md")).documentId;
  otherDocId = (await createDoc("other.md")).documentId;
  const t0 = await createAiToken(a.members[0]!.userId, "Claude Code", 30);
  ai0 = t0.token;
  tokenId0 = t0.row.tokenId;
  ai1 = (await createAiToken(a.members[1]!.userId, "別の AI", 30)).token;
});
afterAll(async () => {
  setDefaultDocumentStorage(undefined);
  await cleanup();
});
afterEach(() => sendSpy.mockClear());

type Auth = { cookie?: string; bearer?: string };
function call(method: string, path: string, auth: Auth = {}, body?: unknown) {
  const headers = new Headers();
  if (auth.cookie) headers.set("cookie", auth.cookie);
  if (auth.bearer) headers.set("authorization", `Bearer ${auth.bearer}`);
  if (body !== undefined) headers.set("content-type", "application/json");
  return app.handle(new Request(`http://localhost${path}`, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) }));
}
async function createDoc(name: string) {
  const res = await call("POST", `/api/product/${a.productId}/directory/${dirId}/document`, { cookie: a.leader.cookie }, { name, content: `# ${name}` });
  return (await res.json()) as { documentId: string };
}
async function newTask(extra: Record<string, unknown> = {}, member = a.members[0]!) {
  const res = await call("POST", `/api/product/${a.productId}/task`, { cookie: a.leader.cookie }, { taskName: "AI に任せる", productMemberId: member.memberId, documentIds: [docId], ...extra });
  expect(res.status).toBe(201);
  sendSpy.mockClear();
  return ((await res.json()) as { taskId: string }).taskId;
}
const draftsUrl = (taskId: string) => `/api/product/${a.productId}/task/${taskId}/report-draft`;
type Draft = { draftId: string; taskId: string; aiName: string; body: string; status: string; readDocuments: { documentId: string; name: string; version: number }[]; decidedAt: string | null };
async function saveDraft(taskId: string, body = "作業の結果です", extra: Record<string, unknown> = {}, bearer = ai0) {
  const res = await call("POST", draftsUrl(taskId), { bearer }, { body, ...extra });
  expect(res.status).toBe(201);
  return (await res.json()) as Draft;
}
const statusOf = async (taskId: string) => (await db.select({ s: tasks.status }).from(tasks).where(eq(tasks.taskId, taskId)))[0]!.s;

describe("保存(AI)", () => {
  test("持ち主が担当のタスクに保存できる。未確認(pending)、AI の名前と、読んだ文書(名前と版)が控えられる", async () => {
    const taskId = await newTask();
    const draft = await saveDraft(taskId, "  結果です  ", { readDocuments: [{ documentId: docId, version: 1 }] });
    expect(draft.status).toBe("pending");
    expect(draft.aiName).toBe("Claude Code");
    expect(draft.body).toBe("結果です");
    expect(draft.readDocuments).toEqual([{ documentId: docId, name: "仕様/spec.md", version: 1 }]);
    expect(draft.decidedAt).toBeNull();
    expect(await statusOf(taskId)).toBe("in_progress");
  });

  test("担当者にメールで知らせる(確認して判断してもらう)。リーダーには送らない", async () => {
    const taskId = await newTask();
    await saveDraft(taskId, "メールの確認");
    expect(sendSpy).toHaveBeenCalledTimes(1);
    const mail = sendSpy.mock.calls[0]![0];
    expect(mail.to).toBe(a.members[0]!.email);
    expect(mail.subject).toContain("AI の報告の下書き");
    expect(mail.text).toContain("Claude Code");
    expect(mail.text).toContain("メールの確認");
    expect(mail.text).toContain(`/products/${a.productId}`);
  });

  test("人のログイン(担当者本人の cookie でも、リーダーでも)では保存できない(403)。AI 用のトークンだけ", async () => {
    const taskId = await newTask();
    for (const cookie of [a.members[0]!.cookie, a.leader.cookie]) {
      expect((await call("POST", draftsUrl(taskId), { cookie }, { body: "x" })).status).toBe(403);
    }
    expect((await call("POST", draftsUrl(taskId), {}, { body: "x" })).status).toBe(401);
  });

  test("別のメンバーの AI は、そのタスクに保存できない(404)。保存もされない", async () => {
    const taskId = await newTask();
    expect((await call("POST", draftsUrl(taskId), { bearer: ai1 }, { body: "x" })).status).toBe(404);
    expect(await db.select().from(taskReportDrafts).where(eq(taskReportDrafts.taskId, taskId))).toEqual([]);
  });

  test("読んだ文書は、そのタスクに渡された文書で、存在する版だけ。重なりは 1 件にまとまる", async () => {
    const taskId = await newTask();
    const bad = (extra: unknown) => call("POST", draftsUrl(taskId), { bearer: ai0 }, { body: "x", readDocuments: extra });
    expect((await bad([{ documentId: otherDocId, version: 1 }])).status).toBe(400); // 渡されていない文書
    expect((await bad([{ documentId: docId, version: 9 }])).status).toBe(400); // 存在しない版
    expect((await bad([{ documentId: docId, version: 0 }])).status).toBe(422);
    const ok = await saveDraft(taskId, "重複", { readDocuments: [{ documentId: docId, version: 1 }, { documentId: docId, version: 1 }] });
    expect(ok.readDocuments.length).toBe(1);
  });

  test("本文は 1〜10000 文字。NUL は入れない", async () => {
    const taskId = await newTask();
    for (const body of ["", "あ".repeat(10001), "a\u0000b"]) {
      expect((await call("POST", draftsUrl(taskId), { bearer: ai0 }, { body })).status).toBe(422);
    }
    expect((await call("POST", draftsUrl(taskId), { bearer: ai0 }, { body: "あ".repeat(10000) })).status).toBe(201);
  });

  test("保存できる状態: 作業中と差し戻し中。確認待ちと完了は 409", async () => {
    const reported = await newTask();
    await db.update(tasks).set({ status: "reported", reportedAt: new Date() }).where(eq(tasks.taskId, reported));
    expect((await call("POST", draftsUrl(reported), { bearer: ai0 }, { body: "x" })).status).toBe(409);
    const done = await newTask();
    await db.update(tasks).set({ status: "completed", completedAt: new Date() }).where(eq(tasks.taskId, done));
    expect((await call("POST", draftsUrl(done), { bearer: ai0 }, { body: "x" })).status).toBe(409);
    const rejected = await newTask();
    await db.update(tasks).set({ status: "rejected" }).where(eq(tasks.taskId, rejected));
    expect((await call("POST", draftsUrl(rejected), { bearer: ai0 }, { body: "やり直し" })).status).toBe(201);
  });

  test("未確認の下書きは 10 件まで(11 件目は 409)。確認(却下)すると、また保存できる", async () => {
    const taskId = await newTask();
    for (let i = 0; i < 10; i++) await saveDraft(taskId, `下書き ${i}`);
    expect((await call("POST", draftsUrl(taskId), { bearer: ai0 }, { body: "11 件目" })).status).toBe(409);
    const list = (await (await call("GET", draftsUrl(taskId), { cookie: a.members[0]!.cookie })).json()) as Draft[];
    await call("POST", `${draftsUrl(taskId)}/${list[0]!.draftId}/discard`, { cookie: a.members[0]!.cookie });
    expect((await call("POST", draftsUrl(taskId), { bearer: ai0 }, { body: "空いた" })).status).toBe(201);
  });
});

describe("確認できるのは担当者(人)だけ", () => {
  test("担当者は一覧を見られる(新しい順、既定は未確認)。リーダーにも、他のメンバーにも見えない(403)。参加者でなければ 404", async () => {
    const taskId = await newTask();
    await saveDraft(taskId, "最初");
    await saveDraft(taskId, "次");
    const mine = (await (await call("GET", draftsUrl(taskId), { cookie: a.members[0]!.cookie })).json()) as Draft[];
    expect(mine.map((d) => d.body)).toEqual(["次", "最初"]);
    expect((await call("GET", draftsUrl(taskId), { cookie: a.leader.cookie })).status).toBe(403);
    expect((await call("GET", draftsUrl(taskId), { cookie: a.members[1]!.cookie })).status).toBe(403);
    const missing = `/api/product/${a.productId}/task/${crypto.randomUUID()}/report-draft`;
    expect((await call("GET", missing, { cookie: a.members[0]!.cookie })).status).toBe(404);
  });

  test("AI 用のトークンでは、一覧・採用・却下はできない(403)。AI が自分で報告に出せない", async () => {
    const taskId = await newTask();
    const draft = await saveDraft(taskId);
    expect((await call("GET", draftsUrl(taskId), { bearer: ai0 })).status).toBe(403);
    expect((await call("POST", `${draftsUrl(taskId)}/${draft.draftId}/adopt`, { bearer: ai0 })).status).toBe(403);
    expect((await call("POST", `${draftsUrl(taskId)}/${draft.draftId}/discard`, { bearer: ai0 })).status).toBe(403);
    expect(await statusOf(taskId)).toBe("in_progress");
  });

  test("status で絞れる(pending / adopted / discarded / all)", async () => {
    const taskId = await newTask();
    const d1 = await saveDraft(taskId, "却下する");
    await saveDraft(taskId, "未確認のまま");
    await call("POST", `${draftsUrl(taskId)}/${d1.draftId}/discard`, { cookie: a.members[0]!.cookie });
    const get = async (q: string) => ((await (await call("GET", `${draftsUrl(taskId)}${q}`, { cookie: a.members[0]!.cookie })).json()) as Draft[]).map((d) => d.body);
    expect(await get("")).toEqual(["未確認のまま"]);
    expect(await get("?status=discarded")).toEqual(["却下する"]);
    expect((await get("?status=all")).sort()).toEqual(["却下する", "未確認のまま"]);
  });
});

describe("採用(完了報告に出す)", () => {
  test("そのまま出す: タスクが確認待ちになり、完了報告のメッセージができ、下書きは採用済みになる。リーダーにメールが届く", async () => {
    const taskId = await newTask();
    const draft = await saveDraft(taskId, "# 結果\n\n実装しました");
    sendSpy.mockClear(); // 保存のときの、担当者へのメールは数えない
    const res = await call("POST", `${draftsUrl(taskId)}/${draft.draftId}/adopt`, { cookie: a.members[0]!.cookie });
    expect(res.status).toBe(200);
    const adopted = (await res.json()) as Draft;
    expect(adopted.status).toBe("adopted");
    expect(adopted.decidedAt).not.toBeNull();
    expect(await statusOf(taskId)).toBe("reported");
    const [message] = await db.select().from(taskMessages).where(eq(taskMessages.taskId, taskId));
    expect([message!.kind, message!.body, message!.authorMemberId]).toEqual(["report", "# 結果\n\n実装しました", a.members[0]!.memberId]);
    const [row] = await db.select().from(taskReportDrafts).where(eq(taskReportDrafts.draftId, draft.draftId));
    expect(row!.adoptedMessageId).toBe(message!.messageId);
    expect(row!.decidedBy).toBe(a.members[0]!.userId);
    // リーダーにメール(AI の下書きをもとにしたこと、本文の抜粋つき)
    expect(sendSpy).toHaveBeenCalledTimes(1);
    const mail = sendSpy.mock.calls[0]![0];
    expect(mail.to).toEqual([a.leader.email]);
    expect(mail.subject).toContain("タスクの完了報告");
    expect(mail.text).toContain("AI「Claude Code」の下書き");
    expect(mail.text).toContain("実装しました");
    // リーダーは、メッセージの履歴で、報告を読める
    const history = (await (await call("GET", `/api/product/${a.productId}/task/${taskId}/message`, { cookie: a.leader.cookie })).json()) as { messages: { kind: string; body: string }[] };
    expect(history.messages.some((m) => m.kind === "report" && m.body.includes("実装しました"))).toBe(true);
  });

  test("直して出す: body を渡すと、直した本文で報告になる(下書きの本文は変わらない)", async () => {
    const taskId = await newTask();
    const draft = await saveDraft(taskId, "AI の本文");
    const res = await call("POST", `${draftsUrl(taskId)}/${draft.draftId}/adopt`, { cookie: a.members[0]!.cookie }, { body: "担当者が直した本文" });
    expect(res.status).toBe(200);
    const [message] = await db.select().from(taskMessages).where(eq(taskMessages.taskId, taskId));
    expect(message!.body).toBe("担当者が直した本文");
    const [row] = await db.select().from(taskReportDrafts).where(eq(taskReportDrafts.draftId, draft.draftId));
    expect(row!.body).toBe("AI の本文");
    expect((await call("POST", `${draftsUrl(await newTask())}/${crypto.randomUUID()}/adopt`, { cookie: a.members[0]!.cookie }, { body: "" })).status).toBe(422);
  });

  test("差し戻し中のタスクなら、再提出(resubmit)のメッセージになる", async () => {
    const taskId = await newTask();
    await db.update(tasks).set({ status: "rejected" }).where(eq(tasks.taskId, taskId));
    const draft = await saveDraft(taskId, "やり直した結果");
    expect((await call("POST", `${draftsUrl(taskId)}/${draft.draftId}/adopt`, { cookie: a.members[0]!.cookie })).status).toBe(200);
    const [message] = await db.select().from(taskMessages).where(eq(taskMessages.taskId, taskId));
    expect(message!.kind).toBe("resubmit");
    expect(await statusOf(taskId)).toBe("reported");
  });

  test("出すと、ほかの未確認の下書きは却下になる", async () => {
    const taskId = await newTask();
    const d1 = await saveDraft(taskId, "採用する");
    const d2 = await saveDraft(taskId, "不要になる");
    await call("POST", `${draftsUrl(taskId)}/${d1.draftId}/adopt`, { cookie: a.members[0]!.cookie });
    const all = (await (await call("GET", `${draftsUrl(taskId)}?status=all`, { cookie: a.members[0]!.cookie })).json()) as Draft[];
    expect(Object.fromEntries(all.map((d) => [d.body, d.status]))).toEqual({ 採用する: "adopted", 不要になる: "discarded" });
    expect((await call("POST", `${draftsUrl(taskId)}/${d2.draftId}/adopt`, { cookie: a.members[0]!.cookie })).status).toBe(409);
  });

  test("担当者でなければ 403(リーダーも)。すでに確認済みの下書きは 409。報告済み・完了のタスクは 409", async () => {
    const taskId = await newTask();
    const draft = await saveDraft(taskId);
    const url = `${draftsUrl(taskId)}/${draft.draftId}/adopt`;
    expect((await call("POST", url, { cookie: a.leader.cookie })).status).toBe(403);
    expect((await call("POST", url, { cookie: a.members[1]!.cookie })).status).toBe(403);
    expect((await call("POST", url, { cookie: a.members[0]!.cookie })).status).toBe(200);
    expect((await call("POST", url, { cookie: a.members[0]!.cookie })).status).toBe(409);

    const t2 = await newTask();
    const d2 = await saveDraft(t2);
    await db.update(tasks).set({ status: "completed", completedAt: new Date() }).where(eq(tasks.taskId, t2));
    expect((await call("POST", `${draftsUrl(t2)}/${d2.draftId}/adopt`, { cookie: a.members[0]!.cookie })).status).toBe(409);
    expect((await call("POST", `${draftsUrl(t2)}/${crypto.randomUUID()}/adopt`, { cookie: a.members[0]!.cookie })).status).toBe(404);
  });

  test("別のタスクの下書きは、そのタスクの URL では 404", async () => {
    const t1 = await newTask();
    const t2 = await newTask();
    const draft = await saveDraft(t1);
    expect((await call("POST", `${draftsUrl(t2)}/${draft.draftId}/adopt`, { cookie: a.members[0]!.cookie })).status).toBe(404);
  });

  test("同時に 2 つの下書きを出そうとしても、片方だけ成功する(メッセージも 1 件)", async () => {
    const taskId = await newTask();
    const d1 = await saveDraft(taskId, "A");
    const d2 = await saveDraft(taskId, "B");
    const [r1, r2] = await Promise.all([
      call("POST", `${draftsUrl(taskId)}/${d1.draftId}/adopt`, { cookie: a.members[0]!.cookie }),
      call("POST", `${draftsUrl(taskId)}/${d2.draftId}/adopt`, { cookie: a.members[0]!.cookie }),
    ]);
    expect([r1.status, r2.status].sort()).toEqual([200, 409]);
    expect((await db.select().from(taskMessages).where(eq(taskMessages.taskId, taskId))).length).toBe(1);
  });

  test("メールの送信が失敗しても、報告は成功する(ほかの通知と同じ)", async () => {
    const taskId = await newTask();
    const draft = await saveDraft(taskId);
    sendSpy.mockResolvedValueOnce({ ok: false, error: "boom" });
    expect((await call("POST", `${draftsUrl(taskId)}/${draft.draftId}/adopt`, { cookie: a.members[0]!.cookie })).status).toBe(200);
    expect(await statusOf(taskId)).toBe("reported");
  });
});

describe("却下", () => {
  test("担当者は却下できる。タスクの状態は変わらない。担当者でなければ 403。確認済みは 409", async () => {
    const taskId = await newTask();
    const draft = await saveDraft(taskId);
    const url = `${draftsUrl(taskId)}/${draft.draftId}/discard`;
    expect((await call("POST", url, { cookie: a.leader.cookie })).status).toBe(403);
    const res = await call("POST", url, { cookie: a.members[0]!.cookie });
    expect(res.status).toBe(200);
    expect(((await res.json()) as Draft).status).toBe("discarded");
    expect(await statusOf(taskId)).toBe("in_progress");
    expect((await call("POST", url, { cookie: a.members[0]!.cookie })).status).toBe(409);
  });
});

describe("あとから", () => {
  test("トークンを取り消しても、下書きは残る(AI の名前は控えてある)", async () => {
    const taskId = await newTask();
    const draft = await saveDraft(taskId, "トークンが消えても");
    await db.delete(aiTokens).where(eq(aiTokens.tokenId, tokenId0));
    const list = (await (await call("GET", draftsUrl(taskId), { cookie: a.members[0]!.cookie })).json()) as Draft[];
    expect(list.map((d) => [d.draftId, d.aiName])).toEqual([[draft.draftId, "Claude Code"]]);
    // 以降のテストのため、トークンを作り直す
    const t = await createAiToken(a.members[0]!.userId, "Claude Code", 30);
    ai0 = t.token;
    tokenId0 = t.row.tokenId;
  });
  test("読んだ文書が消えても、下書きには名前と版が残る。タスクを消すと、下書きも消える", async () => {
    const doc = (await createDoc("will-be-deleted.md")).documentId;
    const taskId = await newTask({ documentIds: [doc] });
    const draft = await saveDraft(taskId, "読んだ", { readDocuments: [{ documentId: doc, version: 1 }] });
    await call("DELETE", `/api/product/${a.productId}/document/${doc}`, { cookie: a.leader.cookie });
    const list = (await (await call("GET", draftsUrl(taskId), { cookie: a.members[0]!.cookie })).json()) as Draft[];
    expect(list[0]!.readDocuments).toEqual([{ documentId: doc, name: "仕様/will-be-deleted.md", version: 1 }]);
    await db.delete(tasks).where(eq(tasks.taskId, taskId));
    expect(await db.select().from(taskReportDrafts).where(eq(taskReportDrafts.draftId, draft.draftId))).toEqual([]);
  });
});
