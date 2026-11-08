import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { eq } from "drizzle-orm";
import { app } from "../../src/app";
import { db } from "../../src/db";
import { aiTokens, tasks } from "../../src/db/schema";
import { AI_TOKEN_PREFIX, MAX_ACTIVE_AI_TOKENS, bearerAiToken, createAiToken, generateAiToken, isAiAllowed, sha256Hex } from "../../src/lib/ai-token";
import { createMemoryStorage, setDefaultDocumentStorage } from "../../src/lib/storage";
import { cleanup, setupProduct } from "../task/helpers";

// AI 用のトークン: 担当者が発行する。AI はそれで、持ち主のタスクと、渡された文書だけを読める

describe("純粋関数", () => {
  test("トークンは pmai_ で始まり、毎回違う。URL に使える文字だけ", () => {
    const a = generateAiToken();
    const b = generateAiToken();
    expect(a.startsWith(AI_TOKEN_PREFIX)).toBe(true);
    expect(a).not.toBe(b);
    expect(a).toMatch(/^pmai_[A-Za-z0-9_-]{43}$/);
  });
  test("SHA-256 は、同じ入力で同じ値(64 桁の 16 進数)", async () => {
    expect(await sha256Hex("abc")).toBe("ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad");
  });
  test("Authorization から、AI 用のトークンだけを取り出す(CLI のセッショントークンや、ヘッダなしは null)", () => {
    expect(bearerAiToken("Bearer pmai_abc")).toBe("pmai_abc");
    expect(bearerAiToken("bearer pmai_abc")).toBe("pmai_abc");
    expect(bearerAiToken("Bearer sessiontoken")).toBeNull();
    expect(bearerAiToken("Basic pmai_abc")).toBeNull();
    expect(bearerAiToken(null)).toBeNull();
    expect(bearerAiToken(undefined)).toBeNull();
    expect(bearerAiToken("Bearer ")).toBeNull();
  });
  test("許可の一覧: 自分のタスクの一覧、渡された文書の一覧と本文、下書きの保存だけ。それ以外は拒否(既定は拒否)", () => {
    const yes: [string, string][] = [
      ["GET", "/api/me/task"],
      ["GET", "/api/product/p1/task/t1/document"],
      ["GET", "/api/product/p1/document/d1"],
      ["POST", "/api/product/p1/task/t1/report-draft"],
    ];
    for (const [m, path] of yes) expect(isAiAllowed(m, path)).toBe(true);
    const no: [string, string][] = [
      ["POST", "/api/me/ai-token"],
      ["GET", "/api/me/ai-token"],
      ["DELETE", "/api/me/ai-token/x"],
      ["GET", "/api/product/"],
      ["GET", "/api/product/p1"],
      ["PATCH", "/api/product/p1"],
      ["DELETE", "/api/product/p1"],
      ["PUT", "/api/product/p1/document/d1"],
      ["DELETE", "/api/product/p1/document/d1"],
      ["PUT", "/api/product/p1/task/t1/document"],
      ["POST", "/api/product/p1/task"],
      ["PATCH", "/api/product/p1/task/t1/complete"],
      ["GET", "/api/product/p1/document/d1/version"],
      ["POST", "/api/product/p1/document/d1/lock"],
      ["GET", "/api/product/p1/directory"],
      ["GET", "/api/me/task/extra"],
      ["GET", "/api/product/p1/task/t1/document/extra"],
    ];
    for (const [m, path] of no) expect(isAiAllowed(m, path)).toBe(false);
  });
});

type Setup = Awaited<ReturnType<typeof setupProduct>>;
let a: Setup; // リーダー + メンバー 3 人
let dirId: string;
let handed: string; // members[0] に渡した文書
let viaDirDoc: string; // ディレクトリで渡した文書
let notHanded: string;
let taskId: string;
const docs = createMemoryStorage();

beforeAll(async () => {
  setDefaultDocumentStorage(docs);
  a = await setupProduct({ members: 3 });
  dirId = (await createDirectory("仕様")).directoryId;
  const otherDir = (await createDirectory("渡さない")).directoryId;
  handed = (await createDoc(dirId, "handed.md")).documentId;
  viaDirDoc = (await createDoc(otherDir, "via-dir.md")).documentId;
  notHanded = (await createDoc(dirId, "not-handed.md")).documentId;
  const res = await call("POST", `/api/product/${a.productId}/task`, { cookie: a.leader.cookie }, { taskName: "AI に任せる", productMemberId: a.members[0]!.memberId, documentIds: [handed], directoryIds: [otherDir] });
  taskId = ((await res.json()) as { taskId: string }).taskId;
});
afterAll(async () => {
  setDefaultDocumentStorage(undefined);
  await cleanup();
});

type Auth = { cookie?: string; bearer?: string };
function call(method: string, path: string, auth: Auth = {}, body?: unknown) {
  const headers = new Headers();
  if (auth.cookie) headers.set("cookie", auth.cookie);
  if (auth.bearer) headers.set("authorization", `Bearer ${auth.bearer}`);
  if (body !== undefined) headers.set("content-type", "application/json");
  return app.handle(new Request(`http://localhost${path}`, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) }));
}
async function createDirectory(name: string) {
  return (await (await call("POST", `/api/product/${a.productId}/directory`, { cookie: a.leader.cookie }, { name })).json()) as { directoryId: string };
}
async function createDoc(directoryId: string, name: string) {
  const res = await call("POST", `/api/product/${a.productId}/directory/${directoryId}/document`, { cookie: a.leader.cookie }, { name, content: `# ${name}` });
  return (await res.json()) as { documentId: string };
}
const mint = async (member = a.members[0]!, name = "テスト用 AI", days = 90) => (await createAiToken(member.userId, name, days)).token;

describe("発行・一覧・取り消し(人のログインだけ)", () => {
  test("発行すると、中身(pmai_…)は一度だけ返る。一覧には中身が出ない(先頭の数文字だけ)。DB にはハッシュだけを持つ", async () => {
    const m = a.members[1]!;
    const res = await call("POST", "/api/me/ai-token", { cookie: m.cookie }, { name: "Claude Code(仕事用)" });
    expect(res.status).toBe(201);
    const body = (await res.json()) as { token: string; tokenId: string; tokenPrefix: string; name: string; active: boolean; expiresAt: string };
    expect(body.token).toMatch(/^pmai_/);
    expect(body.name).toBe("Claude Code(仕事用)");
    expect(body.active).toBe(true);
    // 既定は 90 日
    expect(new Date(body.expiresAt).getTime() - Date.now()).toBeGreaterThan(89 * 24 * 3600 * 1000);
    const list = (await (await call("GET", "/api/me/ai-token", { cookie: m.cookie })).json()) as Record<string, unknown>[];
    const found = list.find((t) => t.tokenId === body.tokenId)!;
    expect(found.tokenPrefix).toBe(body.token.slice(0, 9));
    expect(JSON.stringify(list)).not.toContain(body.token);
    const [row] = await db.select().from(aiTokens).where(eq(aiTokens.tokenId, body.tokenId));
    expect(row!.tokenHash).toBe(await sha256Hex(body.token));
    expect(JSON.stringify(row)).not.toContain(body.token);
  });

  test("一覧は自分の分だけ。ログインしていなければ 401", async () => {
    await mint(a.members[2]!, "member3 の AI");
    const mine = (await (await call("GET", "/api/me/ai-token", { cookie: a.members[1]!.cookie })).json()) as { name: string }[];
    expect(mine.some((t) => t.name === "member3 の AI")).toBe(false);
    expect((await call("GET", "/api/me/ai-token")).status).toBe(401);
    expect((await call("POST", "/api/me/ai-token", {}, { name: "x" })).status).toBe(401);
  });

  test("名前は 1〜60 文字。期限は 1〜365 日(範囲外は 422)", async () => {
    const m = a.members[2]!;
    for (const body of [{ name: "" }, { name: "あ".repeat(61) }, { name: "ok", expiresInDays: 0 }, { name: "ok", expiresInDays: 366 }, { name: "ok", expiresInDays: 1.5 }]) {
      expect((await call("POST", "/api/me/ai-token", { cookie: m.cookie }, body)).status).toBe(422);
    }
    const ok = await call("POST", "/api/me/ai-token", { cookie: m.cookie }, { name: "30 日", expiresInDays: 30 });
    expect(ok.status).toBe(201);
    const expiresAt = new Date(((await ok.json()) as { expiresAt: string }).expiresAt).getTime();
    expect(expiresAt - Date.now()).toBeLessThan(31 * 24 * 3600 * 1000);
  });

  test("有効なトークンは 10 個まで(11 個目は 409)。取り消すと、また発行できる", async () => {
    const p = await setupProduct({ members: 1 });
    const m = p.members[0]!;
    const ids: string[] = [];
    for (let i = 0; i < MAX_ACTIVE_AI_TOKENS; i++) {
      const res = await call("POST", "/api/me/ai-token", { cookie: m.cookie }, { name: `t${i}` });
      expect(res.status).toBe(201);
      ids.push(((await res.json()) as { tokenId: string }).tokenId);
    }
    expect((await call("POST", "/api/me/ai-token", { cookie: m.cookie }, { name: "11 個目" })).status).toBe(409);
    expect((await call("DELETE", `/api/me/ai-token/${ids[0]}`, { cookie: m.cookie })).status).toBe(204);
    expect((await call("POST", "/api/me/ai-token", { cookie: m.cookie }, { name: "取り消したあと" })).status).toBe(201);
  });

  test("取り消すと、そのトークンは使えない(401)。取り消しは何度呼んでも 204。他の人のトークンは 404(取り消されない)", async () => {
    const owner = a.members[0]!;
    const res = await call("POST", "/api/me/ai-token", { cookie: owner.cookie }, { name: "取り消す" });
    const { token, tokenId } = (await res.json()) as { token: string; tokenId: string };
    expect((await call("GET", "/api/me/task", { bearer: token })).status).toBe(200);
    expect((await call("DELETE", `/api/me/ai-token/${tokenId}`, { cookie: a.members[1]!.cookie })).status).toBe(404);
    expect((await call("GET", "/api/me/task", { bearer: token })).status).toBe(200);
    expect((await call("DELETE", `/api/me/ai-token/${tokenId}`, { cookie: owner.cookie })).status).toBe(204);
    expect((await call("DELETE", `/api/me/ai-token/${tokenId}`, { cookie: owner.cookie })).status).toBe(204);
    expect((await call("GET", "/api/me/task", { bearer: token })).status).toBe(401);
    const list = (await (await call("GET", "/api/me/ai-token", { cookie: owner.cookie })).json()) as { tokenId: string; active: boolean; revokedAt: string | null }[];
    const found = list.find((t) => t.tokenId === tokenId)!;
    expect(found.active).toBe(false);
    expect(found.revokedAt).not.toBeNull();
  });

  test("AI 用のトークンでは、トークンの発行・一覧・取り消しはできない(403)。AI が自分のトークンを増やせない", async () => {
    const token = await mint();
    expect((await call("POST", "/api/me/ai-token", { bearer: token }, { name: "増やす" })).status).toBe(403);
    expect((await call("GET", "/api/me/ai-token", { bearer: token })).status).toBe(403);
    expect((await call("DELETE", `/api/me/ai-token/${crypto.randomUUID()}`, { bearer: token })).status).toBe(403);
  });
});

describe("AI 用のトークンでの認証", () => {
  test("持ち主のタスクの一覧が取れる(持ち主として扱う)", async () => {
    const token = await mint(a.members[0]!);
    const res = await call("GET", "/api/me/task", { bearer: token });
    expect(res.status).toBe(200);
    expect(((await res.json()) as { taskId: string }[]).map((t) => t.taskId)).toContain(taskId);
    // 別のメンバーのトークンでは、そのタスクは出ない
    const other = await mint(a.members[1]!);
    expect(((await (await call("GET", "/api/me/task", { bearer: other })).json()) as { taskId: string }[]).map((t) => t.taskId)).not.toContain(taskId);
  });
  test("知らないトークン、期限切れ、壊れたトークンは 401", async () => {
    expect((await call("GET", "/api/me/task", { bearer: "pmai_unknown" })).status).toBe(401);
    expect((await call("GET", "/api/me/task", { bearer: `${AI_TOKEN_PREFIX}${"x".repeat(43)}` })).status).toBe(401);
    const { token, row } = await createAiToken(a.members[0]!.userId, "期限切れ", 1);
    expect((await call("GET", "/api/me/task", { bearer: token })).status).toBe(200);
    await db.update(aiTokens).set({ expiresAt: new Date(Date.now() - 1000) }).where(eq(aiTokens.tokenId, row.tokenId));
    expect((await call("GET", "/api/me/task", { bearer: token })).status).toBe(401);
  });
  test("使うと lastUsedAt が入る", async () => {
    const { token, row } = await createAiToken(a.members[0]!.userId, "使った日時", 30);
    expect(row.lastUsedAt).toBeNull();
    await call("GET", "/api/me/task", { bearer: token });
    const [after] = await db.select().from(aiTokens).where(eq(aiTokens.tokenId, row.tokenId));
    expect(after!.lastUsedAt).not.toBeNull();
  });
  test("人の cookie でも、CLI のセッションでも、これまでどおり使える(AI 用の許可の一覧は、人には効かない)", async () => {
    expect((await call("GET", `/api/product/${a.productId}`, { cookie: a.leader.cookie })).status).toBe(200);
    expect((await call("GET", "/api/me/task", { cookie: a.members[0]!.cookie })).status).toBe(200);
  });
  test("AI 用のトークンでは、許可の一覧にない操作は 403(プロダクトの取得・変更、文書の書き込み、タスクの作成など)", async () => {
    const token = await mint(a.members[0]!);
    const leaderToken = await mint(a.leader as never);
    for (const t of [token, leaderToken]) {
      expect((await call("GET", `/api/product/${a.productId}`, { bearer: t })).status).toBe(403);
      expect((await call("GET", `/api/product/${a.productId}/directory`, { bearer: t })).status).toBe(403);
      expect((await call("PUT", `/api/product/${a.productId}/document/${handed}`, { bearer: t }, { content: "改ざん", baseVersion: 1 })).status).toBe(403);
      expect((await call("DELETE", `/api/product/${a.productId}/document/${handed}`, { bearer: t })).status).toBe(403);
      expect((await call("POST", `/api/product/${a.productId}/task`, { bearer: t }, { taskName: "x", productMemberId: a.members[0]!.memberId })).status).toBe(403);
      expect((await call("DELETE", `/api/product/${a.productId}`, { bearer: t })).status).toBe(403);
    }
  });
});

describe("持ち主のタスクと、渡された文書だけ", () => {
  test("渡された文書の一覧: 持ち主が担当のタスクなら取れる。別のメンバーの AI は 404(公開のタスクでも)", async () => {
    const mine = await mint(a.members[0]!);
    const res = await call("GET", `/api/product/${a.productId}/task/${taskId}/document`, { bearer: mine });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { documents: { name: string }[] };
    expect(body.documents.map((d) => d.name).sort()).toEqual(["handed.md", "via-dir.md"]);
    const other = await mint(a.members[1]!);
    expect((await call("GET", `/api/product/${a.productId}/task/${taskId}/document`, { bearer: other })).status).toBe(404);
    // 人としては、同じメンバーが読める(公開のタスクの文書の一覧)
    expect((await call("GET", `/api/product/${a.productId}/task/${taskId}/document`, { cookie: a.members[1]!.cookie })).status).toBe(200);
  });

  test("文書の本文: 渡された文書(個別でも、ディレクトリ経由でも)は取れる。渡されていない文書は 404", async () => {
    const mine = await mint(a.members[0]!);
    for (const id of [handed, viaDirDoc]) {
      const res = await call("GET", `/api/product/${a.productId}/document/${id}`, { bearer: mine });
      expect(res.status).toBe(200);
    }
    expect((await call("GET", `/api/product/${a.productId}/document/${notHanded}`, { bearer: mine })).status).toBe(404);
    // 人(同じメンバー)は、渡されていない文書も読める
    expect((await call("GET", `/api/product/${a.productId}/document/${notHanded}`, { cookie: a.members[0]!.cookie })).status).toBe(200);
  });

  test("別のメンバーの AI は、そのタスクに渡された文書を取れない", async () => {
    const other = await mint(a.members[1]!);
    expect((await call("GET", `/api/product/${a.productId}/document/${handed}`, { bearer: other })).status).toBe(404);
  });

  test("タスクが完了したら、渡された文書は取れなくなる", async () => {
    const mine = await mint(a.members[0]!);
    const doc = (await createDoc(dirId, "temp-handed.md")).documentId;
    const res = await call("POST", `/api/product/${a.productId}/task`, { cookie: a.leader.cookie }, { taskName: "すぐ終わる", productMemberId: a.members[0]!.memberId, documentIds: [doc] });
    const tid = ((await res.json()) as { taskId: string }).taskId;
    expect((await call("GET", `/api/product/${a.productId}/document/${doc}`, { bearer: mine })).status).toBe(200);
    await db.update(tasks).set({ status: "completed", completedAt: new Date() }).where(eq(tasks.taskId, tid));
    expect((await call("GET", `/api/product/${a.productId}/document/${doc}`, { bearer: mine })).status).toBe(404);
  });

  test("文書を取ると、呼び出された日時(自動削除の基準)が更新される", async () => {
    const mine = await mint(a.members[0]!);
    const doc = (await createDoc(dirId, "fetch-by-ai.md")).documentId;
    await call("POST", `/api/product/${a.productId}/task`, { cookie: a.leader.cookie }, { taskName: "取る", productMemberId: a.members[0]!.memberId, documentIds: [doc] });
    await call("GET", `/api/product/${a.productId}/document/${doc}`, { bearer: mine });
    const detail = (await (await call("GET", `/api/product/${a.productId}/document/${doc}`, { cookie: a.leader.cookie })).json()) as { lastFetchedAt: string | null };
    expect(detail.lastFetchedAt).not.toBeNull();
  });
});
