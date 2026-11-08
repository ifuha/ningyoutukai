import { afterAll, afterEach, beforeAll, describe, expect, spyOn, test } from "bun:test";
import { eq } from "drizzle-orm";
import { app } from "../../src/app";
import { db } from "../../src/db";
import { productDocumentVersions, productDocuments } from "../../src/db/schema";
import { mailer } from "../../src/lib/mailer";
import { createMemoryStorage, documentStorage, setDefaultDocumentStorage, storage, type R2BucketLike } from "../../src/lib/storage";
import { scheduledDocumentAutoDelete, withWorkerContext, type WorkerEnv } from "../../src/lib/worker-context";
import { cleanup, setupProduct } from "../task/helpers";

// Workers の入口の準備(リクエストごとの db と R2 の差し込み)と、定期実行(文書の自動削除)

const DAY = 24 * 60 * 60 * 1000;
const sendSpy = spyOn(mailer, "send");

// R2 のバケットの、使う分だけを真似た偽物
function fakeBucket() {
  const items = new Map<string, Uint8Array>();
  const deleted: string[] = [];
  const bucket: R2BucketLike = {
    async put(key, value) {
      items.set(key, value instanceof Uint8Array ? value : new Uint8Array(await new Response(value as BodyInit).arrayBuffer()));
      return {};
    },
    async get(key) {
      const bytes = items.get(key);
      return bytes ? { body: new Response(bytes as BodyInit).body as ReadableStream<Uint8Array>, size: bytes.byteLength } : null;
    },
    async delete(key) {
      deleted.push(key);
      items.delete(key);
    },
  };
  return { bucket, items, deleted };
}
const ctxOf = () => {
  const waited: Promise<unknown>[] = [];
  return { ctx: { waitUntil: (p: Promise<unknown>) => void waited.push(p) }, waited };
};
const envOf = (extra: Partial<WorkerEnv> = {}): WorkerEnv => ({ DATABASE_URL: process.env.DATABASE_URL!, ...extra });

beforeAll(() => {
  sendSpy.mockResolvedValue({ ok: true });
});
afterEach(() => {
  setDefaultDocumentStorage(undefined);
  sendSpy.mockClear();
});
afterAll(cleanup);

describe("withWorkerContext(リクエストごとの差し込み)", () => {
  test("STORAGE(アイコン用)と DOCS(文書用)は、別のバケットに入る", async () => {
    const icons = fakeBucket();
    const docs = fakeBucket();
    const { ctx } = ctxOf();
    await withWorkerContext(envOf({ STORAGE: icons.bucket, DOCS: docs.bucket }), ctx, async () => {
      await storage.put("icon.png", "画像");
      await documentStorage.put("p/d/v1.md", "# 文書");
    });
    expect([...icons.items.keys()]).toEqual(["icon.png"]);
    expect([...docs.items.keys()]).toEqual(["p/d/v1.md"]);
  });

  test("DOCS がなければ、文書の操作だけが理由つきで失敗する。STORAGE があるアイコン用は動く", async () => {
    const icons = fakeBucket();
    const { ctx } = ctxOf();
    await withWorkerContext(envOf({ STORAGE: icons.bucket }), ctx, async () => {
      await storage.put("icon.png", "画像");
      await expect(documentStorage.put("p/d/v1.md", "x")).rejects.toThrow("DOCS");
    });
    expect([...icons.items.keys()]).toEqual(["icon.png"]);
  });

  test("STORAGE がなければ、アイコン用だけが失敗する。DOCS の文書は動く", async () => {
    const docs = fakeBucket();
    const { ctx } = ctxOf();
    await withWorkerContext(envOf({ DOCS: docs.bucket }), ctx, async () => {
      await expect(storage.put("icon.png", "x")).rejects.toThrow("STORAGE");
      await documentStorage.put("p/d/v1.md", "# 文書");
    });
    expect([...docs.items.keys()]).toEqual(["p/d/v1.md"]);
  });

  test("終わったら db の接続を閉じる(ctx.waitUntil に渡す)。run が失敗しても閉じる", async () => {
    const { ctx, waited } = ctxOf();
    await withWorkerContext(envOf(), ctx, async () => 1);
    expect(waited.length).toBe(1);
    await Promise.all(waited);
    const failing = ctxOf();
    await expect(withWorkerContext(envOf(), failing.ctx, async () => Promise.reject(new Error("boom")))).rejects.toThrow("boom");
    expect(failing.waited.length).toBe(1);
    await Promise.all(failing.waited);
  });

  test("run の戻り値を返す", async () => {
    expect(await withWorkerContext(envOf(), ctxOf().ctx, async () => "値")).toBe("値");
  });
});

describe("scheduledDocumentAutoDelete(定期実行)", () => {
  test("長い間呼び出されない文書を消す(DB の行と、DOCS の本文)。参加者にメールが届く。新しい文書は消さない", async () => {
    setDefaultDocumentStorage(createMemoryStorage());
    const p = await setupProduct({ members: 1 });
    const call = (method: string, path: string, body?: unknown) =>
      app.handle(new Request(`http://localhost${path}`, { method, headers: { cookie: p.leader.cookie, "content-type": "application/json" }, body: body === undefined ? undefined : JSON.stringify(body) }));
    const dir = ((await (await call("POST", `/api/product/${p.productId}/directory`, { name: "定期" })).json()) as { directoryId: string }).directoryId;
    const create = async (name: string) =>
      ((await (await call("POST", `/api/product/${p.productId}/directory/${dir}/document`, { name, content: "# x" })).json()) as { documentId: string }).documentId;
    const old = await create("old.md");
    const fresh = await create("fresh.md");
    await db.update(productDocuments).set({ createdAt: new Date(Date.now() - 10 * DAY) }).where(eq(productDocuments.documentId, old));
    const [version] = await db.select().from(productDocumentVersions).where(eq(productDocumentVersions.documentId, old));

    const docs = fakeBucket();
    await docs.bucket.put(version!.r2Key, "# x");
    sendSpy.mockClear();
    const { ctx, waited } = ctxOf();
    const results = await scheduledDocumentAutoDelete(envOf({ DOCS: docs.bucket }), ctx);
    await Promise.all(waited);

    const mine = results.find((r) => r.productId === p.productId)!;
    expect(mine.deleted.map((d) => d.name)).toEqual(["old.md"]);
    expect(await db.select().from(productDocuments).where(eq(productDocuments.documentId, old))).toEqual([]);
    expect((await db.select().from(productDocuments).where(eq(productDocuments.documentId, fresh))).length).toBe(1);
    expect(docs.deleted).toContain(version!.r2Key);
    const to = sendSpy.mock.calls.map((c) => c[0].to);
    expect(to).toContain(p.leader.email);
    expect(to).toContain(p.members[0]!.email);
  });

  test("失敗したら、エラーを投げる(実行が失敗扱いになり、次の実行でやり直せる)", async () => {
    const { ctx } = ctxOf();
    await expect(scheduledDocumentAutoDelete({ DATABASE_URL: "postgres://nobody:nopass@127.0.0.1:1/none" }, ctx)).rejects.toThrow();
  });
});
