import "dotenv/config";
import { AsyncLocalStorage } from "node:async_hooks";
import { drizzle } from "drizzle-orm/node-postgres";

export function createDb(url = process.env.DATABASE_URL!) {
  return drizzle(url);
}

export type Db = ReturnType<typeof createDb>;

/**
 * Cloudflare Workers 用: リクエストごとに作った `db` を差し込む入口(`src/worker.ts` が使う)。
 * Workers は、あるリクエストで開いた TCP 接続を、別のリクエストで使い回せない(固まる)。
 * ここに `db` が入っているあいだ、下の `db` はそちらを使う。
 * Bun のローカル起動やテストでは何も入らないので、従来どおり 1 つの `db`(接続プール)を使う。
 */
export const dbStorage = new AsyncLocalStorage<Db>();

const defaultDb = createDb();

export const db = new Proxy(defaultDb, {
  get(_target, prop) {
    const current = dbStorage.getStore() ?? defaultDb;
    const value = Reflect.get(current, prop, current);
    return typeof value === "function" ? value.bind(current) : value;
  },
}) as Db;
