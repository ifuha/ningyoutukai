import { Elysia } from "elysia";
import { CloudflareAdapter } from "elysia/adapter/cloudflare-worker";
import { app } from "./app";
import { createDb, dbStorage } from "./db";
import { createR2Storage, createUnavailableStorage, documentStorageContext, storageContext } from "./lib/storage";
import type { R2BucketLike } from "./lib/storage";

// Cloudflare Workers の入口。`listen` はせず、`fetch` だけを公開する。
// Workers は `new Function` / `eval` を禁止するため、Elysia の AOT コンパイルが使えない。
// app.ts は変えず、ここで Cloudflare 用アダプタの Elysia に `app` を載せて、aot: false で動かす。
const worker = new Elysia({ adapter: CloudflareAdapter }).use(app).compile();

// HYPERDRIVE は任意のバインディング。あれば Hyperdrive 経由、なければ DATABASE_URL で直接つなぐ
// STORAGE も任意のバインディング(ファイルの保存用の R2 バケット。`wrangler.jsonc` の `r2_buckets`)。あれば、リクエストごとに差し込む。
// なければ、ストレージを使うルートが呼ばれたときだけ、「R2 のバインディング(STORAGE)が設定されていません」と失敗する(ほかのルートは動く)。
// DOCS も任意のバインディング(Markdown の文書用の、**非公開**の R2 バケット)。STORAGE(アイコン用。公開 URL あり)とは別のバケット。なければ、文書のルートだけが失敗する。
// バケットを作ってから、`wrangler.jsonc` に足すこと(docs/deploy.md)
type Env = { DATABASE_URL: string; HYPERDRIVE?: { connectionString: string }; STORAGE?: R2BucketLike; DOCS?: R2BucketLike };

export default {
  async fetch(request: Request, env: Env, ctx: { waitUntil(promise: Promise<unknown>): void }) {
    // Workers は接続をリクエストをまたいで使い回せないので、リクエストごとに db を作り、終わったら閉じる
    const db = createDb(env.HYPERDRIVE?.connectionString ?? env.DATABASE_URL);
    try {
      const run = () => dbStorage.run(db, () => worker.fetch(request));
      const storage = env.STORAGE
        ? createR2Storage(env.STORAGE)
        : createUnavailableStorage("R2 のバインディング(STORAGE)が設定されていません。wrangler.jsonc の r2_buckets を確認してください");
      const documents = env.DOCS
        ? createR2Storage(env.DOCS)
        : createUnavailableStorage("R2 のバインディング(DOCS)が設定されていません。wrangler.jsonc の r2_buckets を確認してください");
      return await storageContext.run(storage, () => documentStorageContext.run(documents, run));
    } finally {
      ctx.waitUntil(db.$client.end());
    }
  },
};
