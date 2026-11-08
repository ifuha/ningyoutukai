import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { eq } from "drizzle-orm";
import { app } from "../../src/app";
import { db } from "../../src/db";
import { documentLocks } from "../../src/db/schema";
import { LOCK_HEARTBEAT_MS, LOCK_IDLE_MS, LOCK_WARN_BEFORE_MS, isLockValid, lockIdleMsLeft, lockMsLeft } from "../../src/lib/document-lock";
import { createMemoryStorage, setDefaultDocumentStorage } from "../../src/lib/storage";
import { cleanup, createOutsider, setupProduct } from "../task/helpers";

// 編集ロック: 同時に編集はできない。30 分間編集がなければ外れる。ブラウザを閉じた等(90 秒の途絶)でも外れる

describe("isLockValid / lockMsLeft(純粋関数)", () => {
  const at = (editedAgoMs: number, seenAgoMs: number, now = 1_000_000_000_000) => ({
    row: { lastEditedAt: new Date(now - editedAgoMs), lastSeenAt: new Date(now - seenAgoMs) },
    now,
  });
  test("30 分の編集なし、または 90 秒の途絶で、無効。ちょうどの時点も無効", () => {
    expect(isLockValid(at(0, 0).row, at(0, 0).now)).toBe(true);
    expect(isLockValid(at(LOCK_IDLE_MS - 1, 0).row, at(0, 0).now)).toBe(true);
    expect(isLockValid(at(LOCK_IDLE_MS, 0).row, at(0, 0).now)).toBe(false);
    expect(isLockValid(at(0, LOCK_HEARTBEAT_MS - 1).row, at(0, 0).now)).toBe(true);
    expect(isLockValid(at(0, LOCK_HEARTBEAT_MS).row, at(0, 0).now)).toBe(false);
  });
  test("あと何ミリ秒かは、2 つの条件の早い方。ハートビートが元気なら、30 分から数える", () => {
    expect(lockMsLeft(at(0, 0).row, at(0, 0).now)).toBe(LOCK_HEARTBEAT_MS);
    // ハートビートが 60 秒前のとき、あと 30 秒(90 秒 − 60 秒)
    expect(lockMsLeft(at(0, 60_000).row, at(0, 0).now)).toBe(30_000);
    // 編集が 29 分前、ハートビートがいまなら、あと 1 分(30 分 − 29 分)。90 秒より短い
    expect(lockMsLeft(at(29 * 60_000, 0).row, at(0, 0).now)).toBe(60_000);
  });
  test("30 分の編集なしで外れるまでは、ハートビートとは別に数える(予告に使う)", () => {
    expect(lockIdleMsLeft(at(0, 0).row, at(0, 0).now)).toBe(LOCK_IDLE_MS);
    expect(lockIdleMsLeft(at(29 * 60_000 + 30_000, 0).row, at(0, 0).now)).toBe(30_000);
    expect(lockIdleMsLeft(at(LOCK_IDLE_MS + 1000, 0).row, at(0, 0).now)).toBeLessThan(0);
  });
  test("予告は 1 分前", () => {
    expect(LOCK_WARN_BEFORE_MS).toBe(60_000);
  });
});

type Setup = Awaited<ReturnType<typeof setupProduct>>;
let a: Setup; // リーダー + メンバー 2 人(2 人とも write)
let b: Setup;
let dirId: string;
let readDirId: string;
const docs = createMemoryStorage();

beforeAll(async () => {
  setDefaultDocumentStorage(docs);
  a = await setupProduct();
  b = await setupProduct({ members: 1 });
  dirId = (await createDirectory(a, "ロック")).directoryId;
  readDirId = (await createDirectory(a, "read だけ")).directoryId;
  for (const m of a.members) await call("PUT", `/api/product/${a.productId}/directory/${dirId}/permission/${m.memberId}`, a.leader.cookie, { level: "write" });
});
afterAll(async () => {
  setDefaultDocumentStorage(undefined);
  await cleanup();
});

function call(method: string, path: string, cookie?: string, body?: unknown) {
  const headers = new Headers();
  if (cookie) headers.set("cookie", cookie);
  if (body !== undefined) headers.set("content-type", "application/json");
  return app.handle(new Request(`http://localhost${path}`, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) }));
}
async function createDirectory(s: Setup, name: string) {
  return (await (await call("POST", `/api/product/${s.productId}/directory`, s.leader.cookie, { name })).json()) as { directoryId: string };
}
let n = 0;
async function newDoc(s = a, directoryId = dirId) {
  const res = await call("POST", `/api/product/${s.productId}/directory/${directoryId}/document`, s.leader.cookie, { name: `lock-${++n}.md`, content: "# x" });
  expect(res.status).toBe(201);
  return ((await res.json()) as { documentId: string }).documentId;
}
const lockUrl = (documentId: string, s = a) => `/api/product/${s.productId}/document/${documentId}/lock`;
const docUrl = (documentId: string, s = a) => `/api/product/${s.productId}/document/${documentId}`;
type Lock = { held: boolean; idleMsLeft: number; msLeft: number; warnBeforeMs: number; lockedBy: { memberId: string; userName: string } };
type Conflict = { message: string; reason: string; lockedBy: { memberId: string; userName: string } | null };
const m0 = () => a.members[0]!;
const m1 = () => a.members[1]!;
async function setLockTimes(documentId: string, times: { lastEditedAt?: Date; lastSeenAt?: Date }) {
  await db.update(documentLocks).set(times).where(eq(documentLocks.documentId, documentId));
}
async function editingBy(documentId: string) {
  const res = await call("GET", docUrl(documentId), a.leader.cookie);
  return ((await res.json()) as { editingBy: { memberId: string; userName: string } | null }).editingBy;
}

describe("取る", () => {
  test("write のある人が取れる。あと 30 分(ハートビートが元気なので、90 秒の方が先に来る = 画面が知らせ続ける前提)", async () => {
    const id = await newDoc();
    const res = await call("POST", lockUrl(id), m0().cookie);
    expect(res.status).toBe(200);
    const body = (await res.json()) as Lock;
    expect(body.held).toBe(true);
    expect(body.lockedBy).toEqual({ memberId: m0().memberId, userName: "member1" });
    expect(body.warnBeforeMs).toBe(60_000);
    expect(body.msLeft).toBeGreaterThan(0);
    expect(body.msLeft).toBeLessThanOrEqual(LOCK_HEARTBEAT_MS);
    expect(body.idleMsLeft).toBeGreaterThan(LOCK_IDLE_MS - 5_000);
  });
  test("リーダーも取れる。read だけのディレクトリのメンバーは 403。参加者でなければ 404。他のプロダクトの文書は 404", async () => {
    const id = await newDoc();
    expect((await call("POST", lockUrl(id), a.leader.cookie)).status).toBe(200);
    const readDoc = await newDoc(a, readDirId);
    expect((await call("POST", lockUrl(readDoc), m0().cookie)).status).toBe(403);
    const outsider = await createOutsider();
    expect((await call("POST", lockUrl(id), outsider.cookie)).status).toBe(404);
    expect((await call("POST", lockUrl(id, b), b.leader.cookie)).status).toBe(404);
  });
  test("他の人が編集中なら 409(reason = taken、編集中の人の名前つき)。自分なら取り直せる", async () => {
    const id = await newDoc();
    await call("POST", lockUrl(id), m0().cookie);
    const res = await call("POST", lockUrl(id), m1().cookie);
    expect(res.status).toBe(409);
    const body = (await res.json()) as Conflict;
    expect(body.reason).toBe("taken");
    expect(body.lockedBy?.userName).toBe("member1");
    expect(body.message).toContain("member1");
    expect((await call("POST", lockUrl(id), m0().cookie)).status).toBe(200);
  });
  test("同時に 2 人が取ろうとしても、片方だけが取れる", async () => {
    const id = await newDoc();
    const [r1, r2] = await Promise.all([call("POST", lockUrl(id), m0().cookie), call("POST", lockUrl(id), m1().cookie)]);
    expect([r1.status, r2.status].sort()).toEqual([200, 409]);
  });
  test("取ると、一覧と文書の応答の editingBy に、編集中の人が出る(緑の点と名前)。外すと null に戻る", async () => {
    const id = await newDoc();
    expect(await editingBy(id)).toBeNull();
    await call("POST", lockUrl(id), m1().cookie);
    expect(await editingBy(id)).toEqual({ memberId: m1().memberId, userName: "member2" });
    const list = (await (await call("GET", `/api/product/${a.productId}/directory`, m0().cookie)).json()) as { documents: { documentId: string; editingBy: { userName: string } | null }[] }[];
    const found = list.flatMap((d) => d.documents).find((d) => d.documentId === id);
    expect(found?.editingBy?.userName).toBe("member2");
    expect((await call("DELETE", lockUrl(id), m1().cookie)).status).toBe(204);
    expect(await editingBy(id)).toBeNull();
  });
});

describe("外れる条件", () => {
  test("30 分間編集がなければ、外れる。editingBy は null、ほかの人が取れる", async () => {
    const id = await newDoc();
    await call("POST", lockUrl(id), m0().cookie);
    await setLockTimes(id, { lastEditedAt: new Date(Date.now() - LOCK_IDLE_MS - 1000) });
    expect(await editingBy(id)).toBeNull();
    expect((await call("POST", lockUrl(id), m1().cookie)).status).toBe(200);
    expect(await editingBy(id)).toEqual({ memberId: m1().memberId, userName: "member2" });
  });
  test("90 秒ハートビートが途絶えても、外れる(ブラウザを閉じた・通信が切れた)", async () => {
    const id = await newDoc();
    await call("POST", lockUrl(id), m0().cookie);
    await setLockTimes(id, { lastSeenAt: new Date(Date.now() - LOCK_HEARTBEAT_MS - 1000) });
    expect(await editingBy(id)).toBeNull();
    expect((await call("POST", lockUrl(id), m1().cookie)).status).toBe(200);
  });
  test("まだ 30 分たっていなければ、ほかの人は取れない", async () => {
    const id = await newDoc();
    await call("POST", lockUrl(id), m0().cookie);
    await setLockTimes(id, { lastEditedAt: new Date(Date.now() - LOCK_IDLE_MS + 60_000) });
    expect((await call("POST", lockUrl(id), m1().cookie)).status).toBe(409);
  });
});

describe("知らせ(ハートビート)", () => {
  test("持ち主が送ると 200。あと何ミリ秒かが返る", async () => {
    const id = await newDoc();
    await call("POST", lockUrl(id), m0().cookie);
    const res = await call("PUT", lockUrl(id), m0().cookie, { edited: false });
    expect(res.status).toBe(200);
    const body = (await res.json()) as Lock;
    expect(body.msLeft).toBeGreaterThan(LOCK_HEARTBEAT_MS - 5_000);
    // 取った直後は、30 分の編集なしまで、ほぼ 30 分ある(msLeft は 90 秒に頭打ちだが、idleMsLeft は 30 分を示す)
    expect(body.idleMsLeft).toBeGreaterThan(LOCK_IDLE_MS - 5_000);
  });
  test("編集があった知らせ(edited: true)は、30 分を数え直す。なかった知らせは、数え直さない", async () => {
    const id = await newDoc();
    await call("POST", lockUrl(id), m0().cookie);
    // 最後の編集を 29 分 30 秒前にする → あと 30 秒で外れる(予告の 1 分より短い)
    await setLockTimes(id, { lastEditedAt: new Date(Date.now() - LOCK_IDLE_MS + 30_000) });
    const idle = (await (await call("PUT", lockUrl(id), m0().cookie, { edited: false })).json()) as Lock;
    expect(idle.idleMsLeft).toBeLessThanOrEqual(30_000);
    expect(idle.idleMsLeft).toBeLessThanOrEqual(idle.warnBeforeMs); // 予告を出す時間に入っている
    const edited = (await (await call("PUT", lockUrl(id), m0().cookie, { edited: true })).json()) as Lock;
    expect(edited.idleMsLeft).toBeGreaterThan(LOCK_IDLE_MS - 5_000);
    expect(edited.idleMsLeft).toBeGreaterThan(edited.warnBeforeMs); // 予告の時間から出た
  });
  test("30 分の編集なしで外れたあとの知らせは 409(reason = released)。画面は「ロックが解除されました」と出す", async () => {
    const id = await newDoc();
    await call("POST", lockUrl(id), m0().cookie);
    await setLockTimes(id, { lastEditedAt: new Date(Date.now() - LOCK_IDLE_MS - 1000) });
    const res = await call("PUT", lockUrl(id), m0().cookie, { edited: false });
    expect(res.status).toBe(409);
    const body = (await res.json()) as Conflict;
    expect(body.reason).toBe("released");
    expect(body.lockedBy).toBeNull();
  });
  test("外れたあと、ほかの人が取っていたら 409(reason = taken)。だれも取っていなければ、取り直せる", async () => {
    const id = await newDoc();
    await call("POST", lockUrl(id), m0().cookie);
    await setLockTimes(id, { lastEditedAt: new Date(Date.now() - LOCK_IDLE_MS - 1000) });
    expect((await call("POST", lockUrl(id), m0().cookie)).status).toBe(200);
    await setLockTimes(id, { lastEditedAt: new Date(Date.now() - LOCK_IDLE_MS - 1000) });
    await call("POST", lockUrl(id), m1().cookie);
    const res = await call("PUT", lockUrl(id), m0().cookie, { edited: true });
    expect(res.status).toBe(409);
    expect(((await res.json()) as Conflict).reason).toBe("taken");
  });
  test("ロックを持っていない人の知らせは 409(released)。他の人のロックは更新しない", async () => {
    const id = await newDoc();
    expect((await call("PUT", lockUrl(id), m0().cookie, { edited: true })).status).toBe(409);
    await call("POST", lockUrl(id), m1().cookie);
    const before = await db.select().from(documentLocks).where(eq(documentLocks.documentId, id));
    expect((await call("PUT", lockUrl(id), m0().cookie, { edited: true })).status).toBe(409);
    const after = await db.select().from(documentLocks).where(eq(documentLocks.documentId, id));
    expect(after[0]!.lastEditedAt.getTime()).toBe(before[0]!.lastEditedAt.getTime());
  });
});

describe("外す", () => {
  test("自分のロックを外せる。何度呼んでも 204。他の人のロックは外せない", async () => {
    const id = await newDoc();
    await call("POST", lockUrl(id), m0().cookie);
    expect((await call("DELETE", lockUrl(id), m1().cookie)).status).toBe(204);
    expect(await editingBy(id)).not.toBeNull();
    expect((await call("DELETE", lockUrl(id), m0().cookie)).status).toBe(204);
    expect(await editingBy(id)).toBeNull();
    expect((await call("DELETE", lockUrl(id), m0().cookie)).status).toBe(204);
  });
  test("リーダーも、他の人のロックを強制的に外せない(強制解除は作らない)", async () => {
    const id = await newDoc();
    await call("POST", lockUrl(id), m0().cookie);
    expect((await call("DELETE", lockUrl(id), a.leader.cookie)).status).toBe(204);
    expect(await editingBy(id)).toEqual({ memberId: m0().memberId, userName: "member1" });
  });
});

describe("ロックの効き目(保存・名前の変更・移動・削除)", () => {
  test("他の人が編集中の文書は、保存できない(409)。持ち主は保存できて、保存するとロックが外れる", async () => {
    const id = await newDoc();
    await call("POST", lockUrl(id), m0().cookie);
    const blocked = await call("PUT", docUrl(id), m1().cookie, { content: "割り込み", baseVersion: 1 });
    expect(blocked.status).toBe(409);
    expect(((await blocked.json()) as { message: string }).message).toContain("member1");
    const saved = await call("PUT", docUrl(id), m0().cookie, { content: "持ち主の保存", baseVersion: 1 });
    expect(saved.status).toBe(200);
    expect(await editingBy(id)).toBeNull();
  });
  test("リーダーでも、他の人が編集中なら保存できない", async () => {
    const id = await newDoc();
    await call("POST", lockUrl(id), m0().cookie);
    expect((await call("PUT", docUrl(id), a.leader.cookie, { content: "x", baseVersion: 1 })).status).toBe(409);
  });
  test("ロックがなければ(CLI や API からの保存)、保存できる", async () => {
    const id = await newDoc();
    expect((await call("PUT", docUrl(id), m1().cookie, { content: "ロックなし", baseVersion: 1 })).status).toBe(200);
  });
  test("ロックが外れていれば(30 分の編集なし)、ほかの人が保存できる", async () => {
    const id = await newDoc();
    await call("POST", lockUrl(id), m0().cookie);
    await setLockTimes(id, { lastEditedAt: new Date(Date.now() - LOCK_IDLE_MS - 1000) });
    expect((await call("PUT", docUrl(id), m1().cookie, { content: "外れたあと", baseVersion: 1 })).status).toBe(200);
  });
  test("名前の変更・移動・削除も、他の人が編集中は 409。持ち主はできる", async () => {
    const id = await newDoc();
    await call("POST", lockUrl(id), m0().cookie);
    expect((await call("PATCH", docUrl(id), m1().cookie, { name: "other.md" })).status).toBe(409);
    expect((await call("PATCH", docUrl(id), a.leader.cookie, { directoryId: readDirId })).status).toBe(409);
    expect((await call("DELETE", docUrl(id), m1().cookie)).status).toBe(409);
    expect((await call("PATCH", docUrl(id), m0().cookie, { name: "mine.md" })).status).toBe(200);
    expect((await call("DELETE", docUrl(id), m0().cookie)).status).toBe(204);
  });
  test("「自動削除しない」の切り替えは、編集中でも、リーダーができる(内容の編集ではない)", async () => {
    const id = await newDoc();
    await call("POST", lockUrl(id), m0().cookie);
    expect((await call("PATCH", docUrl(id), a.leader.cookie, { keepForever: true })).status).toBe(200);
  });
  test("文書を読むのは、編集中でもできる(プレビュー)", async () => {
    const id = await newDoc();
    await call("POST", lockUrl(id), m0().cookie);
    expect((await call("GET", docUrl(id), m1().cookie)).status).toBe(200);
  });
  test("文書を消すと、ロックも一緒に消える", async () => {
    const id = await newDoc();
    await call("POST", lockUrl(id), m0().cookie);
    await call("DELETE", docUrl(id), m0().cookie);
    expect(await db.select().from(documentLocks).where(eq(documentLocks.documentId, id))).toEqual([]);
  });
});
