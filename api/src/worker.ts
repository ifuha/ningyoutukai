import { Elysia } from "elysia";
import { CloudflareAdapter } from "elysia/adapter/cloudflare-worker";
import { app } from "./app";
import { scheduledDocumentAutoDelete, scheduledSoftDeleteCleanup, SOFT_DELETE_CLEANUP_CRON, withWorkerContext } from "./lib/worker-context";
import type { WorkerCtx, WorkerEnv } from "./lib/worker-context";

// Cloudflare Workers の入口。`listen` はせず、`fetch`(リクエスト)と `scheduled`(定期実行)を公開する。
// Workers は `new Function` / `eval` を禁止するため、Elysia の AOT コンパイルが使えない。
// app.ts は変えず、ここで Cloudflare 用アダプタの Elysia に `app` を載せて、aot: false で動かす。
const worker = new Elysia({ adapter: CloudflareAdapter }).use(app).compile();

// db と R2 のバインディング(STORAGE = アイコン用、DOCS = 文書用)の差し込みは、`lib/worker-context.ts`

export default {
  async fetch(request: Request, env: WorkerEnv, ctx: WorkerCtx) {
    return await withWorkerContext(env, ctx, async () => worker.fetch(request));
  },
  // 定期実行(`wrangler.jsonc` の `triggers.crons`)。どの式で起動されたかで、処理を分ける
  // - SOFT_DELETE_CLEANUP_CRON(数分おき): 期限を過ぎた soft delete 中のセクション・メモを物理削除する
  // - それ以外(毎日 1 回): 長い間呼び出されない文書を、自動で削除する
  async scheduled(controller: { cron: string }, env: WorkerEnv, ctx: WorkerCtx) {
    if (controller.cron === SOFT_DELETE_CLEANUP_CRON) ctx.waitUntil(scheduledSoftDeleteCleanup(env, ctx));
    else ctx.waitUntil(scheduledDocumentAutoDelete(env, ctx));
  },
};
