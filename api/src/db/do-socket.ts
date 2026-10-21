import { Duplex } from "node:stream";

type Conn = { readable: ReadableStream<Uint8Array>; writable: WritableStream<Uint8Array> };

/**
 * `pg` の `stream` オプション用の、net.Socket もどき。
 * `open()` で得た Web ストリーム(Durable Object が RPC で渡す、コンテナの TCP ソケット)に、
 * `pg` が使う最小限のソケット API(connect / setNoDelay / setKeepAlive / ref / unref)を被せる。
 */
export class DoSocket extends Duplex {
  private reader?: ReadableStreamDefaultReader<Uint8Array>;
  private writer?: WritableStreamDefaultWriter<Uint8Array>;
  private ready?: Promise<void>;
  private reading = false;

  constructor(private open: () => Promise<Conn>) {
    super();
  }

  // pg は connect(port, host) を呼ぶ。host / port は使わず、open() が接続先を決める
  connect() {
    this.ready = this.open().then((conn) => {
      this.reader = conn.readable.getReader();
      this.writer = conn.writable.getWriter();
    });
    this.ready.then(
      () => {
        this.emit("connect");
        this.emit("ready");
      },
      (err) => this.destroy(err),
    );
    return this;
  }

  setNoDelay() { return this; }
  setKeepAlive() { return this; }
  setTimeout() { return this; }
  ref() { return this; }
  unref() { return this; }

  override _read() {
    if (this.reading || !this.ready) return;
    this.reading = true;
    this.ready
      .then(async () => {
        // push() が false を返す(= pg 側が詰まっている)まで読み、次の _read まで待つ(バックプレッシャー)
        for (;;) {
          const { done, value } = await this.reader!.read();
          if (done) {
            this.push(null);
            return;
          }
          if (!this.push(value)) return;
        }
      })
      .catch((err) => this.destroy(err))
      .finally(() => {
        this.reading = false;
      });
  }

  override _write(chunk: Buffer, _enc: BufferEncoding, cb: (err?: Error | null) => void) {
    this.ready!.then(() => this.writer!.write(chunk)).then(() => cb(), cb);
  }

  override _final(cb: (err?: Error | null) => void) {
    (this.ready ?? Promise.resolve())
      .then(() => this.writer?.close())
      .then(() => cb(), () => cb());
  }

  override _destroy(err: Error | null, cb: (err?: Error | null) => void) {
    // 後始末: 読み側をキャンセル、書き側を中断して、DO 側のソケットも閉じさせる
    Promise.allSettled([this.reader?.cancel(), this.writer?.abort(err ?? undefined)]).then(() => cb(err));
  }
}
