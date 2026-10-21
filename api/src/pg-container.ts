import { DurableObject } from "cloudflare:workers";

type PgContainerEnv = {
  PG_PASSWORD?: string;
  PG_USER?: string;
  PG_DATABASE?: string;
  /** 起動時にダンプから復元するときの URL(infra/postgres/restore-on-init.sh) */
  RESTORE_FROM_URL?: string;
  /** コンテナが何の接続も受けないまま、この時間(秒)が過ぎたら止める。既定 600(10 分) */
  PG_SLEEP_AFTER_SECONDS?: string;
};

export type PgConnection = {
  readable: ReadableStream<Uint8Array>;
  writable: WritableStream<Uint8Array>;
};

const PG_PORT = 5432;

/**
 * Cloudflare Containers で動かす Postgres(infra/postgres/Dockerfile)を持つ Durable Object。
 * Worker からは RPC の `openPg()` を呼び、返ってきた readable / writable を TCP ソケットの代わりに
 * `pg` へ渡す(`src/db/do-socket.ts`)。1 回の呼び出しで、コンテナの 5432 へ 1 本の接続を開く。
 *
 * `@cloudflare/containers` の `Container` クラスは使わない。このクラスは、起動の確認に HTTP リクエストを
 * ポートへ送るが、Postgres は HTTP を話さないので、確認が通らず(最後は Durable Object ごと abort される)、
 * 使えなかった。そのため `ctx.container` を直接使う。
 *
 * - 5432 が開くのは、postgres の初期化(`RESTORE_FROM_URL` からの復元を含む)が終わってから。
 *   `openPg()` は、Postgres が接続を受けられるまで待つので、復元が終わるまでリクエストは待たされる。
 *   復元に失敗するとコンテナが止まるので、`openPg()` が失敗する。
 * - ディスクは永続化されない。コンテナが止まる(`PG_SLEEP_AFTER_SECONDS` 無通信など)と、データは消える。
 */
export class PgContainer extends DurableObject<PgContainerEnv> {
  private ready?: Promise<void>;
  private lastActivity = Date.now();

  constructor(ctx: DurableObjectState, env: PgContainerEnv) {
    super(ctx, env);
    // Durable Object が作り直されても、コンテナが動いていれば、見張りと無通信の確認を再開する
    if (ctx.container?.running) {
      this.watch();
      void this.scheduleAlarm();
    }
  }

  private get sleepAfterMs() {
    return Number(this.env.PG_SLEEP_AFTER_SECONDS ?? 600) * 1000;
  }

  /** コンテナを起動して(寝ていれば)、Postgres への TCP 接続を 1 本開き、そのストリームを返す */
  async openPg(): Promise<PgConnection> {
    await this.ensureReady();
    this.lastActivity = Date.now();
    const conn = this.ctx.container!.getTcpPort(PG_PORT).connect(`localhost:${PG_PORT}`);
    await conn.opened;
    // 接続の本数は数えない。ローカルでは、Worker 側が閉じても conn.closed が解決しなかったため、
    // 数が減らず、無通信の判定に使えなかった(コンテナ内の Postgres 側では接続は閉じている)。
    // 無通信かどうかは、最後に接続を開いた時刻だけで見る。
    return { readable: conn.readable, writable: conn.writable };
  }

  private ensureReady() {
    const c = this.ctx.container!;
    if (this.ready && c.running) return this.ready;
    const ready = (async () => {
      if (!c.running) {
        const env: Record<string, string> = {
          POSTGRES_PASSWORD: this.env.PG_PASSWORD ?? "postgres",
        };
        if (this.env.PG_USER) env.POSTGRES_USER = this.env.PG_USER;
        if (this.env.PG_DATABASE) env.POSTGRES_DB = this.env.PG_DATABASE;
        if (this.env.RESTORE_FROM_URL) env.RESTORE_FROM_URL = this.env.RESTORE_FROM_URL;
        // 復元のダンプを取りに行くときだけ、コンテナから外へ出られるようにする
        c.start({ env, enableInternet: Boolean(this.env.RESTORE_FROM_URL) });
        this.watch();
      }
      await this.waitForPostgres();
      await this.scheduleAlarm();
    })();
    this.ready = ready;
    ready.catch(() => {
      if (this.ready === ready) this.ready = undefined;
    });
    return ready;
  }

  /** コンテナが止まったら、起動済みの記録を消す(次の openPg で起動し直す) */
  private watch() {
    const c = this.ctx.container!;
    c.monitor().then(
      () => (this.ready = undefined),
      () => (this.ready = undefined),
    );
  }

  /**
   * Postgres の SSLRequest(8 バイト)を送り、'N' か 'S' が返るまで待つ。
   * 初期化中(復元を含む)は 5432 が開いておらず、接続はすぐ閉じられるので、開くまで繰り返す。
   */
  private async waitForPostgres(timeoutMs = 120_000) {
    const deadline = Date.now() + timeoutMs;
    let last: unknown;
    while (Date.now() < deadline) {
      try {
        if (await this.probePg()) return;
      } catch (e) {
        last = e;
      }
      if (!this.ctx.container?.running) {
        throw new Error("コンテナが停止しました(Postgres の初期化または復元に失敗した可能性)", { cause: last });
      }
      await new Promise((r) => setTimeout(r, 300));
    }
    throw new Error(`Postgres が ${timeoutMs}ms 以内に起動しませんでした`, { cause: last });
  }

  private async probePg() {
    const conn = this.ctx.container!.getTcpPort(PG_PORT).connect(`localhost:${PG_PORT}`);
    try {
      await conn.opened;
      const writer = conn.writable.getWriter();
      await writer.write(new Uint8Array([0, 0, 0, 8, 4, 210, 22, 47]));
      const { value, done } = await conn.readable.getReader().read();
      return !done && (value![0] === 0x4e || value![0] === 0x53);
    } finally {
      await conn.close().catch(() => {});
    }
  }

  private async scheduleAlarm() {
    await this.ctx.storage.setAlarm(Date.now() + this.sleepAfterMs);
  }

  /** 無通信の確認。最後に接続を開いてから sleepAfter が過ぎていなければ、次を予約する */
  async alarm() {
    const c = this.ctx.container;
    if (!c?.running) return;
    const idle = Date.now() - this.lastActivity;
    if (idle < this.sleepAfterMs) {
      await this.ctx.storage.setAlarm(Date.now() + Math.max(1000, this.sleepAfterMs - idle));
      return;
    }
    console.log("[pg-container] 無通信のため、コンテナを止めます(データは消えます)");
    c.signal(15);
  }
}
