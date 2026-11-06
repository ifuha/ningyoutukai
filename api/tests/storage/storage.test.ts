import { afterAll, afterEach, beforeAll, describe, expect, test } from "bun:test";
import { mkdtemp, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Elysia } from "elysia";
import {
  assertValidKey,
  createLocalStorage,
  createMemoryStorage,
  createR2Storage,
  createUnavailableStorage,
  setDefaultStorage,
  storage,
  storageContext,
  StorageKeyError,
  type R2BucketLike,
} from "../../src/lib/storage";
import { objectStorage } from "../../src/lib/storage-plugin";

const text = async (s: ReadableStream<Uint8Array>) => new Response(s).text();
const bytesOf = async (s: ReadableStream<Uint8Array>) => new Uint8Array(await new Response(s).arrayBuffer());

describe("assertValidKey(キーの検査)", () => {
  test("英数字・_・-・.・/ だけの、ふつうのキーは通る", () => {
    for (const key of ["a", "product-icons/1234-abcd.png", "x/y/z_1.webp", "A.B-c_d"]) {
      expect(assertValidKey(key)).toBe(key);
    }
  });
  test("フォルダの外へ出るキー(..)、空の部分、先頭・末尾の / は拒否する", () => {
    for (const key of ["../a", "a/../b", "a/./b", "/a", "a/", "a//b", ".", "..", ""]) {
      expect(() => assertValidKey(key)).toThrow(StorageKeyError);
    }
  });
  test("使えない文字(空白・日本語・\\・%・?・#・NUL)と、長すぎるキーは拒否する", () => {
    for (const key of ["a b", "アイコン.png", "a\\b", "a%2e%2e", "a?b", "a#b", "a\u0000b", "x".repeat(513)]) {
      expect(() => assertValidKey(key)).toThrow(StorageKeyError);
    }
  });
});

// 保存先の 3 つの実装が、同じ約束を守ること
function contract(name: string, make: () => Promise<ReturnType<typeof createMemoryStorage> | ReturnType<typeof createLocalStorage>>) {
  describe(`${name}(保存先の約束)`, () => {
    test("保存したものを、そのまま取り出せる(文字列・バイナリ・Content-Type・大きさ)", async () => {
      const s = await make();
      await s.put("a/hello.txt", "こんにちは", { contentType: "text/plain" });
      const got = await s.get("a/hello.txt");
      expect(got).not.toBeNull();
      expect(await text(got!.body)).toBe("こんにちは");
      expect(got!.contentType).toBe("text/plain");
      expect(got!.size).toBe(new TextEncoder().encode("こんにちは").byteLength);

      const png = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0, 1, 2, 255, 254]);
      await s.put("icons/p1.png", png, { contentType: "image/png" });
      expect(await bytesOf((await s.get("icons/p1.png"))!.body)).toEqual(png);
    });
    test("ArrayBuffer と ReadableStream も保存できる", async () => {
      const s = await make();
      await s.put("buf", new Uint8Array([1, 2, 3]).buffer);
      expect(await bytesOf((await s.get("buf"))!.body)).toEqual(new Uint8Array([1, 2, 3]));
      await s.put("stream", new Response("流れる").body as ReadableStream<Uint8Array>);
      expect(await text((await s.get("stream"))!.body)).toBe("流れる");
    });
    test("同じキーに保存すると上書きされる。Content-Type を渡さなければ undefined", async () => {
      const s = await make();
      await s.put("k", "古い", { contentType: "text/plain" });
      await s.put("k", "新しい");
      const got = await s.get("k");
      expect(await text(got!.body)).toBe("新しい");
      expect(got!.contentType).toBeUndefined();
    });
    test("ないキーは null。消すと取り出せなくなる。ないものを消してもエラーにならない", async () => {
      const s = await make();
      expect(await s.get("nothing")).toBeNull();
      await s.put("k", "x");
      await s.delete("k");
      expect(await s.get("k")).toBeNull();
      await s.delete("k");
      await s.delete("never-existed");
    });
    test("正しくないキーは、どの操作でも拒否する", async () => {
      const s = await make();
      await expect(s.put("../evil", "x")).rejects.toThrow(StorageKeyError);
      await expect(s.get("../evil")).rejects.toThrow(StorageKeyError);
      await expect(s.delete("a/../b")).rejects.toThrow(StorageKeyError);
    });
  });
}

contract("メモリ", async () => createMemoryStorage());

describe("ローカルのフォルダ", () => {
  let dir: string;
  beforeAll(async () => {
    dir = await mkdtemp(join(tmpdir(), "ningyoutukai-storage-test-"));
  });
  afterAll(async () => {
    await rm(dir, { recursive: true, force: true });
  });
  contract("ローカルのフォルダ", async () => createLocalStorage(await mkdtemp(join(dir, "case-"))));

  test("キーの階層どおりにフォルダを作り、Content-Type は .meta.json に残す", async () => {
    const root = await mkdtemp(join(dir, "layout-"));
    const s = createLocalStorage(root);
    await s.put("product-icons/p1/icon.png", new Uint8Array([1]), { contentType: "image/png" });
    expect(await readdir(join(root, "product-icons", "p1"))).toEqual(["icon.png", "icon.png.meta.json"]);
    await s.delete("product-icons/p1/icon.png");
    expect(await readdir(join(root, "product-icons", "p1"))).toEqual([]);
  });
  test("フォルダの外には書かない(拒否したキーで、外にファイルができない)", async () => {
    const root = await mkdtemp(join(dir, "escape-"));
    const s = createLocalStorage(root);
    await expect(s.put("../escaped.txt", "x")).rejects.toThrow(StorageKeyError);
    expect(await readdir(dir)).not.toContain("escaped.txt");
  });
  test("ETag は、中身が同じなら同じ、変わると変わる", async () => {
    const s = createLocalStorage(await mkdtemp(join(dir, "etag-")));
    await s.put("k", "a");
    const first = (await s.get("k"))!.etag;
    await s.put("k", "a");
    expect((await s.get("k"))!.etag).toBe(first);
    await s.put("k", "b");
    expect((await s.get("k"))!.etag).not.toBe(first);
    expect(first).toMatch(/^"[0-9a-f]{16}"$/);
  });
});

describe("R2(バインディング)", () => {
  // R2 のバケットの、使う分だけを真似た偽物
  const fakeBucket = () => {
    const calls: { put: unknown[][]; delete: string[] } = { put: [], delete: [] };
    const items = new Map<string, { bytes: Uint8Array; contentType?: string }>();
    const bucket: R2BucketLike = {
      async put(key, value, options) {
        calls.put.push([key, options]);
        const bytes = value instanceof Uint8Array ? value : new Uint8Array(await new Response(value as BodyInit).arrayBuffer());
        items.set(key, { bytes, contentType: options?.httpMetadata?.contentType });
        return {};
      },
      async get(key) {
        const item = items.get(key);
        if (!item) return null;
        return {
          body: new Response(item.bytes as BodyInit).body as ReadableStream<Uint8Array>,
          size: item.bytes.byteLength,
          httpEtag: '"etag-1"',
          httpMetadata: { contentType: item.contentType },
        };
      },
      async delete(key) {
        calls.delete.push(key);
        items.delete(key);
      },
    };
    return { bucket, calls };
  };

  test("保存・取り出し・削除が、バケットに渡る。Content-Type は httpMetadata に入れる", async () => {
    const { bucket, calls } = fakeBucket();
    const s = createR2Storage(bucket);
    await s.put("product-icons/p1.png", new Uint8Array([9, 8, 7]), { contentType: "image/png" });
    expect(calls.put[0]).toEqual(["product-icons/p1.png", { httpMetadata: { contentType: "image/png" } }]);
    const got = await s.get("product-icons/p1.png");
    expect(got!.contentType).toBe("image/png");
    expect(got!.size).toBe(3);
    expect(got!.etag).toBe('"etag-1"');
    expect(await bytesOf(got!.body)).toEqual(new Uint8Array([9, 8, 7]));
    await s.delete("product-icons/p1.png");
    expect(calls.delete).toEqual(["product-icons/p1.png"]);
    expect(await s.get("product-icons/p1.png")).toBeNull();
  });
  test("Content-Type を渡さなければ httpMetadata は付けない。文字列は、バイト列にして渡す", async () => {
    const { bucket, calls } = fakeBucket();
    await createR2Storage(bucket).put("k", "文字");
    expect(calls.put[0]).toEqual(["k", { httpMetadata: undefined }]);
  });
  test("キーの検査は、バケットに触る前に行う", async () => {
    const { bucket, calls } = fakeBucket();
    const s = createR2Storage(bucket);
    await expect(s.put("../x", "a")).rejects.toThrow(StorageKeyError);
    await expect(s.get("/x")).rejects.toThrow(StorageKeyError);
    await expect(s.delete("a//b")).rejects.toThrow(StorageKeyError);
    expect(calls.put).toEqual([]);
    expect(calls.delete).toEqual([]);
  });
});

describe("使えない保存先(Workers で、バインディングが無いとき)", () => {
  test("どの操作も、理由つきで失敗する", async () => {
    const s = createUnavailableStorage("R2 のバインディングがありません");
    await expect(s.put("k", "x")).rejects.toThrow("R2 のバインディングがありません");
    await expect(s.get("k")).rejects.toThrow("R2 のバインディングがありません");
    await expect(s.delete("k")).rejects.toThrow("R2 のバインディングがありません");
  });
});

describe("差し込み(storage / storageContext)とプラグイン", () => {
  afterEach(() => setDefaultStorage(undefined));

  test("storageContext に入れた保存先を、storage が使う(Workers のリクエストごとの R2)。出ると、既定に戻る", async () => {
    const fallback = createMemoryStorage();
    setDefaultStorage(fallback);
    const request = createMemoryStorage();
    await storageContext.run(request, () => storage.put("in-request", "R2 のつもり"));
    expect(request.keys()).toEqual(["in-request"]);
    expect(fallback.keys()).toEqual([]);
    await storage.put("outside", "既定");
    expect(fallback.keys()).toEqual(["outside"]);
  });

  test(".use(objectStorage) すると、ハンドラで storage が使える", async () => {
    const mem = createMemoryStorage();
    setDefaultStorage(mem);
    const app = new Elysia()
      .use(objectStorage)
      .put("/icon/:id", async ({ params, body, storage }) => {
        await storage.put(`icons/${params.id}`, body as string, { contentType: "text/plain" });
        return { ok: true };
      })
      .get("/icon/:id", async ({ params, storage, status }) => {
        const object = await storage.get(`icons/${params.id}`);
        if (!object) return status(404, "なし");
        return new Response(object.body, { headers: { "content-type": object.contentType ?? "application/octet-stream" } });
      });

    const put = await app.handle(new Request("http://localhost/icon/p1", { method: "PUT", body: "中身", headers: { "content-type": "text/plain" } }));
    expect(put.status).toBe(200);
    expect(mem.keys()).toEqual(["icons/p1"]);
    const got = await app.handle(new Request("http://localhost/icon/p1"));
    expect(got.status).toBe(200);
    expect(got.headers.get("content-type")).toBe("text/plain");
    expect(await got.text()).toBe("中身");
    expect((await app.handle(new Request("http://localhost/icon/none"))).status).toBe(404);
  });
});
