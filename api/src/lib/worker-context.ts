import { createDb, dbStorage } from "../db";
import { runDocumentAutoDelete } from "./document-auto-delete";
import { createR2Storage, createUnavailableStorage, documentStorage, documentStorageContext, storageContext } from "./storage";
import type { R2BucketLike } from "./storage";

// Cloudflare Workers の入口(`src/worker.ts`)が使う、リクエストごと / 定期実行ごとの準備。
// HYPERDRIVE は任意のバインディング。あれば Hyperdrive 経由、なければ DATABASE_URL で直接つなぐ。
// STORAGE も任意のバインディング(ファイルの保存用の R2 バケット。アイコン用。`wrangler.jsonc` の `r2_buckets`)。あれば、リクエストごとに差し込む。
// なければ、ストレージを使うルートが呼ばれたときだけ、「R2 のバインディング(STORAGE)が設定されていません」と失敗する(ほかのルートは動く)。
// DOCS も任意のバインディング(Markdown の文書用の、**非公開**の R2 バケット)。STORAGE(アイコン用。公開 URL あり)とは別のバケット。なければ、文書のルートだけが失敗する。
// バケットを作ってから、`wrangler.jsonc` に足すこと(docs/deploy.md)
export type WorkerEnv = { DATABASE_URL: string; HYPERDRIVE?: { connectionString: string }; STORAGE?: R2BucketLike; DOCS?: R2BucketLike };
export type WorkerCtx = { waitUntil(promise: Promise<unknown>): void };

/**
 * `run` を、リクエストごとの db と R2 のバインディングを差し込んだ状態で動かす。
 * Workers は接続をリクエストをまたいで使い回せないので、毎回 db を作り、終わったら閉じる
 */
export async function withWorkerContext<T>(env: WorkerEnv, ctx: WorkerCtx, run: () => Promise<T>): Promise<T> {
  const db = createDb(env.HYPERDRIVE?.connectionString ?? env.DATABASE_URL);
  try {
    const icons = env.STORAGE
      ? createR2Storage(env.STORAGE)
      : createUnavailableStorage("R2 のバインディング(STORAGE)が設定されていません。wrangler.jsonc の r2_buckets を確認してください");
    const documents = env.DOCS
      ? createR2Storage(env.DOCS)
      : createUnavailableStorage("R2 のバインディング(DOCS)が設定されていません。wrangler.jsonc の r2_buckets を確認してください");
    return await dbStorage.run(db, () => storageContext.run(icons, () => documentStorageContext.run(documents, run)));
  } finally {
    ctx.waitUntil(db.$client.end());
  }
}

/**
 * 定期実行(Cron Trigger)で動かす、文書の自動削除。`wrangler.jsonc` の `triggers.crons`。
 * 失敗しても、次の実行でやり直せる(条件に合う文書は、また候補になる)。エラーはログに出して、実行は失敗扱いにする
 */
export async function scheduledDocumentAutoDelete(env: WorkerEnv, ctx: WorkerCtx) {
  try {
    const results = await withWorkerContext(env, ctx, () => runDocumentAutoDelete(documentStorage));
    const count = results.reduce((sum, r) => sum + r.deleted.length, 0);
    console.log(`[document-auto-delete] ${results.length} プロダクトで ${count} 件の文書を削除しました`);
    return results;
  } catch (e) {
    console.error("[document-auto-delete] 自動削除に失敗しました", e);
    throw e;
  }
}
