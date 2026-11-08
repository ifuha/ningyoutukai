import { afterEach, describe, expect, test } from "bun:test";
import { Elysia } from "elysia";
import {
  createMemoryStorage,
  createUnavailableStorage,
  documentStorage,
  documentStorageContext,
  setDefaultDocumentStorage,
  setDefaultStorage,
  storage,
  storageContext,
} from "../../src/lib/storage";
import { documentObjectStorage, objectStorage } from "../../src/lib/storage-plugin";

// 文書(Markdown)用の保存先。アイコン用(storage)とは別のバケットなので、2 つは混ざらない

afterEach(() => {
  setDefaultStorage(undefined);
  setDefaultDocumentStorage(undefined);
});

describe("documentStorage と storage は別の保存先", () => {
  test("既定では、それぞれ別の入れ物に保存する(混ざらない)", async () => {
    const icons = createMemoryStorage();
    const docs = createMemoryStorage();
    setDefaultStorage(icons);
    setDefaultDocumentStorage(docs);
    await storage.put("icon.png", "画像");
    await documentStorage.put("p1/d1/v1.md", "# 仕様");
    expect(icons.keys()).toEqual(["icon.png"]);
    expect(docs.keys()).toEqual(["p1/d1/v1.md"]);
  });

  test("リクエストごとの差し込み(Workers の R2)も、別々。片方だけ差し込んでも、もう片方は既定のまま", async () => {
    const iconsDefault = createMemoryStorage();
    const docsDefault = createMemoryStorage();
    setDefaultStorage(iconsDefault);
    setDefaultDocumentStorage(docsDefault);
    const docsRequest = createMemoryStorage();
    await documentStorageContext.run(docsRequest, async () => {
      await documentStorage.put("in-request.md", "R2(DOCS)のつもり");
      await storage.put("icon-default.png", "アイコンは既定");
    });
    expect(docsRequest.keys()).toEqual(["in-request.md"]);
    expect(docsDefault.keys()).toEqual([]);
    expect(iconsDefault.keys()).toEqual(["icon-default.png"]);
  });

  test("両方を差し込む(worker.ts と同じ入れ子)と、それぞれのバインディングに行く", async () => {
    const icons = createMemoryStorage();
    const docs = createMemoryStorage();
    await storageContext.run(icons, () =>
      documentStorageContext.run(docs, async () => {
        await storage.put("a.png", "x");
        await documentStorage.put("b.md", "y");
      }),
    );
    expect(icons.keys()).toEqual(["a.png"]);
    expect(docs.keys()).toEqual(["b.md"]);
  });

  test("DOCS のバインディングが無いとき(使えない保存先)は、文書の操作だけが理由つきで失敗し、アイコン用は動く", async () => {
    const icons = createMemoryStorage();
    const unavailable = createUnavailableStorage("R2 のバインディング(DOCS)が設定されていません");
    await storageContext.run(icons, () =>
      documentStorageContext.run(unavailable, async () => {
        await storage.put("ok.png", "x");
        await expect(documentStorage.put("a.md", "y")).rejects.toThrow("DOCS");
        await expect(documentStorage.get("a.md")).rejects.toThrow("DOCS");
      }),
    );
    expect(icons.keys()).toEqual(["ok.png"]);
  });

  test("キーの検査は、文書用でも効く(フォルダの外へ出るキーは拒否)", async () => {
    setDefaultDocumentStorage(createMemoryStorage());
    await expect(documentStorage.put("../escape.md", "x")).rejects.toThrow();
  });
});

describe("プラグイン .use(documentObjectStorage)", () => {
  test("ハンドラで documentStorage が使える。アイコン用の storage とは別に使える", async () => {
    const icons = createMemoryStorage();
    const docs = createMemoryStorage();
    setDefaultStorage(icons);
    setDefaultDocumentStorage(docs);
    const app = new Elysia()
      .use(objectStorage)
      .use(documentObjectStorage)
      .put("/doc/:id", async ({ params, body, documentStorage }) => {
        await documentStorage.put(`docs/${params.id}.md`, body as string, { contentType: "text/markdown" });
        return { ok: true };
      })
      .get("/doc/:id", async ({ params, documentStorage, status }) => {
        const object = await documentStorage.get(`docs/${params.id}.md`);
        if (!object) return status(404, "なし");
        return new Response(object.body, { headers: { "content-type": object.contentType ?? "application/octet-stream" } });
      });

    const put = await app.handle(new Request("http://localhost/doc/d1", { method: "PUT", body: "# 手順", headers: { "content-type": "text/plain" } }));
    expect(put.status).toBe(200);
    expect(docs.keys()).toEqual(["docs/d1.md"]);
    expect(icons.keys()).toEqual([]);
    const got = await app.handle(new Request("http://localhost/doc/d1"));
    expect(got.headers.get("content-type")).toBe("text/markdown");
    expect(await got.text()).toBe("# 手順");
    expect((await app.handle(new Request("http://localhost/doc/none"))).status).toBe(404);
  });
});
