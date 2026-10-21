import { Elysia } from "elysia";
import { CloudflareAdapter } from "elysia/adapter/cloudflare-worker";
import { app } from "./app";
import { createDb, dbStorage } from "./db";
import { DoSocket } from "./db/do-socket";
import type { PgContainer } from "./pg-container";

// Durable Object のクラスは、Worker のエントリから export する必要がある
export { PgContainer } from "./pg-container";

// Cloudflare Workers の入口。`listen` はせず、`fetch` だけを公開する。
// Workers は `new Function` / `eval` を禁止するため、Elysia の AOT コンパイルが使えない。
// app.ts は変えず、ここで Cloudflare 用アダプタの Elysia に `app` を載せて、aot: false で動かす。
const worker = new Elysia({ adapter: CloudflareAdapter }).use(app).compile();

// 接続先は次の優先順位で選ぶ。どれも無ければ DATABASE_URL に直接つなぐ。
//  1. PG_VIA_DO: Durable Object(Containers の Postgres)経由。DATABASE_URL は認証情報(ユーザー / パスワード / DB 名)だけに使う
//  2. HYPERDRIVE: Hyperdrive 経由(Neon など)
type Env = {
  DATABASE_URL: string;
  HYPERDRIVE?: { connectionString: string };
  PG_VIA_DO?: DurableObjectNamespace<PgContainer>;
};

function createRequestDb(env: Env) {
  if (env.PG_VIA_DO) {
    const pg = env.PG_VIA_DO.getByName("pg");
    // pg の接続ごとに、DO に TCP 接続を 1 本開かせる(トランザクションは 1 接続の中で完結する)
    return createDb(env.DATABASE_URL, { ssl: false, stream: () => new DoSocket(() => pg.openPg()) });
  }
  return createDb(env.HYPERDRIVE?.connectionString ?? env.DATABASE_URL);
}

export default {
  async fetch(request: Request, env: Env, ctx: { waitUntil(promise: Promise<unknown>): void }) {
    // Workers は接続をリクエストをまたいで使い回せないので、リクエストごとに db を作り、終わったら閉じる
    const db = createRequestDb(env);
    try {
      return await dbStorage.run(db, () => worker.fetch(request));
    } finally {
      ctx.waitUntil(db.$client.end());
    }
  },
};
