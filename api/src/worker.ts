import { Elysia } from "elysia";
import { CloudflareAdapter } from "elysia/adapter/cloudflare-worker";
import { app } from "./app";
import { scheduledDocumentAutoDelete, withWorkerContext } from "./lib/worker-context";
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
  // 定期実行(`wrangler.jsonc` の `triggers.crons`): 長い間呼び出されない文書を、自動で削除する
  async scheduled(_controller: unknown, env: WorkerEnv, ctx: WorkerCtx) {
    ctx.waitUntil(scheduledDocumentAutoDelete(env, ctx));
  },
};
