// Cloudflare Workers の型のうち、DO 経由の Postgres(pg-container.ts / worker.ts)で使う分だけを書いた最小の宣言。
// @cloudflare/workers-types を全体に入れると、bun-types(テスト)の fetch / Response と衝突するので入れない。

interface DurableObjectState {
  container?: {
    running: boolean;
    start(options?: { env?: Record<string, string>; enableInternet?: boolean; entrypoint?: string[] }): void;
    monitor(): Promise<unknown>;
    signal(signo: number): void;
    destroy(error?: unknown): Promise<void>;
    getTcpPort(port: number): {
      connect(address: string): {
        opened: Promise<unknown>;
        closed: Promise<unknown>;
        close(): Promise<void>;
        readable: ReadableStream<Uint8Array>;
        writable: WritableStream<Uint8Array>;
      };
    };
  };
  storage: { setAlarm(scheduledTime: number): Promise<void> };
}

interface DurableObjectNamespace<T = unknown> {
  getByName(name: string): T;
}

declare module "cloudflare:workers" {
  export class DurableObject<Env = unknown> {
    ctx: DurableObjectState;
    env: Env;
    constructor(ctx: DurableObjectState, env: Env);
  }
}
