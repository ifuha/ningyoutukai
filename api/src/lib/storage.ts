import { AsyncLocalStorage } from "node:async_hooks";

/**
 * オブジェクトストレージ(プロダクトのアイコンなど、ファイルの保存)。
 * 保存先は、環境で切り替える(`db/index.ts` の `dbStorage` と同じ作り):
 * - Cloudflare Workers(本番): R2 のバインディング(`createR2Storage`)。`src/worker.ts` が、リクエストごとに差し込む。鍵は要らない
 * - Bun のローカル起動とテスト: ローカルのフォルダ(`createLocalStorage`。`STORAGE_DIR`、既定は `./.local-storage`)。R2 の鍵が無くても動く
 * ルートからは、`.use(objectStorage)`(`storage-plugin.ts`)して、`storage.put` / `get` / `delete` を使う。
 * **R2 のバックアップ用バケット(`pg_dump` のダンプ)とは別のバケット**を使う(`docs/infra.md`)。
 */

export type StorageBody = Uint8Array | ArrayBuffer | ReadableStream<Uint8Array> | string;

export type StoredObject = {
  body: ReadableStream<Uint8Array>;
  /** 保存したときの Content-Type(なければ undefined) */
  contentType: string | undefined;
  /** バイト数 */
  size: number;
  /** 中身が変わると変わる印(`ETag`。キャッシュの判定に使う)。ない実装では undefined */
  etag: string | undefined;
};

export interface ObjectStorage {
  /** 保存する。同じキーがあれば、上書きする */
  put(key: string, body: StorageBody, options?: { contentType?: string }): Promise<void>;
  /** 取り出す。なければ null */
  get(key: string): Promise<StoredObject | null>;
  /** 消す。なくても、エラーにしない(何度呼んでも同じ) */
  delete(key: string): Promise<void>;
}

/** キーの形が正しくないとき(外に出るエラーにはしない。呼び出し側が、自分で作ったキーを渡す前提) */
export class StorageKeyError extends Error {
  constructor(key: string) {
    super(`ストレージのキーが正しくありません: ${JSON.stringify(key)}`);
    this.name = "StorageKeyError";
  }
}

const KEY_MAX_LENGTH = 512;
// 英数字・`_`・`-`・`.`・`/` だけ。`/` で区切った各部分は、空でなく、`.` や `..` だけでもない(フォルダの外へ出られないように)
const KEY_PATTERN = /^[A-Za-z0-9_\-./]+$/;

/** キーを検査する。正しくなければ `StorageKeyError`。正しければ、そのまま返す */
export function assertValidKey(key: string): string {
  if (key.length === 0 || key.length > KEY_MAX_LENGTH || !KEY_PATTERN.test(key)) throw new StorageKeyError(key);
  if (key.startsWith("/") || key.endsWith("/")) throw new StorageKeyError(key);
  for (const part of key.split("/")) {
    if (part === "" || part === "." || part === "..") throw new StorageKeyError(key);
  }
  return key;
}

function toBytes(body: StorageBody): Uint8Array | ReadableStream<Uint8Array> {
  if (typeof body === "string") return new TextEncoder().encode(body);
  if (body instanceof ArrayBuffer) return new Uint8Array(body);
  return body;
}

async function readAll(body: Uint8Array | ReadableStream<Uint8Array>): Promise<Uint8Array> {
  if (body instanceof Uint8Array) return body;
  return new Uint8Array(await new Response(body).arrayBuffer());
}

function streamOf(bytes: Uint8Array): ReadableStream<Uint8Array> {
  return new Response(bytes as BodyInit).body as ReadableStream<Uint8Array>;
}

// ---- R2(Cloudflare Workers のバインディング) ----

/** R2 のバケットのバインディングのうち、使う分だけの形(`@cloudflare/workers-types` を入れずに済ませる) */
export interface R2BucketLike {
  put(
    key: string,
    value: ReadableStream | ArrayBuffer | ArrayBufferView | string | null,
    options?: { httpMetadata?: { contentType?: string } },
  ): Promise<unknown>;
  get(key: string): Promise<{
    body: ReadableStream<Uint8Array>;
    size: number;
    httpEtag?: string;
    httpMetadata?: { contentType?: string };
  } | null>;
  delete(key: string): Promise<void>;
}

export function createR2Storage(bucket: R2BucketLike): ObjectStorage {
  return {
    async put(key, body, options) {
      assertValidKey(key);
      await bucket.put(key, toBytes(body), {
        httpMetadata: options?.contentType ? { contentType: options.contentType } : undefined,
      });
    },
    async get(key) {
      assertValidKey(key);
      const object = await bucket.get(key);
      if (!object) return null;
      return {
        body: object.body,
        contentType: object.httpMetadata?.contentType,
        size: object.size,
        etag: object.httpEtag,
      };
    },
    async delete(key) {
      assertValidKey(key);
      await bucket.delete(key);
    },
  };
}

// ---- ローカルのフォルダ(Bun のローカル起動・テスト) ----

/**
 * ローカルのフォルダに保存する。ファイル `<dir>/<key>` に中身を、`<dir>/<key>.meta.json` に Content-Type を書く。
 * Workers では使わない(`node:fs` は、使うときに読み込む)。キーの検査で、フォルダの外へは出られない
 */
export function createLocalStorage(dir: string): ObjectStorage {
  const metaSuffix = ".meta.json";
  const pathOf = async (key: string) => {
    const path = await import("node:path");
    return path.join(dir, assertValidKey(key));
  };
  return {
    async put(key, body, options) {
      const fs = await import("node:fs/promises");
      const path = await import("node:path");
      const file = await pathOf(key);
      await fs.mkdir(path.dirname(file), { recursive: true });
      await fs.writeFile(file, await readAll(toBytes(body)));
      await fs.writeFile(file + metaSuffix, JSON.stringify({ contentType: options?.contentType ?? null }));
    },
    async get(key) {
      const fs = await import("node:fs/promises");
      const file = await pathOf(key);
      let bytes: Uint8Array;
      try {
        bytes = new Uint8Array(await fs.readFile(file));
      } catch (e) {
        if ((e as NodeJS.ErrnoException).code === "ENOENT") return null;
        throw e;
      }
      let contentType: string | undefined;
      try {
        const meta = JSON.parse(await fs.readFile(file + metaSuffix, "utf8")) as { contentType?: string | null };
        contentType = meta.contentType ?? undefined;
      } catch {
        contentType = undefined;
      }
      const hash = new Uint8Array(await crypto.subtle.digest("SHA-256", bytes as BufferSource));
      const etag = `"${Array.from(hash.slice(0, 8), (b) => b.toString(16).padStart(2, "0")).join("")}"`;
      return { body: streamOf(bytes), contentType, size: bytes.byteLength, etag };
    },
    async delete(key) {
      const fs = await import("node:fs/promises");
      const file = await pathOf(key);
      await fs.rm(file, { force: true });
      await fs.rm(file + metaSuffix, { force: true });
    },
  };
}

// ---- メモリ(テスト用) ----

export function createMemoryStorage(): ObjectStorage & { keys(): string[] } {
  const items = new Map<string, { bytes: Uint8Array; contentType: string | undefined }>();
  return {
    async put(key, body, options) {
      assertValidKey(key);
      items.set(key, { bytes: await readAll(toBytes(body)), contentType: options?.contentType });
    },
    async get(key) {
      assertValidKey(key);
      const item = items.get(key);
      if (!item) return null;
      return { body: streamOf(item.bytes), contentType: item.contentType, size: item.bytes.byteLength, etag: undefined };
    },
    async delete(key) {
      assertValidKey(key);
      items.delete(key);
    },
    keys: () => [...items.keys()].sort(),
  };
}

// ---- 使えない(Workers で、R2 のバインディングが設定されていないとき) ----

/** 使おうとすると、理由つきで失敗する保存先。バインディングの設定漏れを、分かりやすいエラーにする */
export function createUnavailableStorage(reason: string): ObjectStorage {
  const fail = async (): Promise<never> => {
    throw new Error(reason);
  };
  return { put: fail, get: fail, delete: fail };
}

// ---- 差し込みの入口(`db/index.ts` の dbStorage と同じ作り) ----

/**
 * Cloudflare Workers 用: リクエストごとの `storage`(R2 のバインディング)を差し込む入口(`src/worker.ts` が使う)。
 * ここに入っているあいだ、下の `storage` はそちらを使う。Bun のローカル起動やテストでは何も入らないので、既定(ローカルのフォルダ)を使う。
 */
export const storageContext = new AsyncLocalStorage<ObjectStorage>();

let defaultStorage: ObjectStorage | undefined;
const getDefaultStorage = () =>
  (defaultStorage ??= createLocalStorage(process.env.STORAGE_DIR ?? "./.local-storage"));

/** テストで、既定の保存先を差し替える(`undefined` で、既定に戻す) */
export function setDefaultStorage(storage: ObjectStorage | undefined) {
  defaultStorage = storage;
}

/** いまの保存先。Workers ではリクエストの R2、それ以外では既定(ローカルのフォルダ)に、そのまま渡す */
export const storage: ObjectStorage = {
  put: (key, body, options) => (storageContext.getStore() ?? getDefaultStorage()).put(key, body, options),
  get: (key) => (storageContext.getStore() ?? getDefaultStorage()).get(key),
  delete: (key) => (storageContext.getStore() ?? getDefaultStorage()).delete(key),
};
