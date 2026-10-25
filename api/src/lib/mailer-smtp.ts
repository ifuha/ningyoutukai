/**
 * SMTP(Gmail のアプリパスワードなど)でメールを送る。Cloudflare Workers でのみ動く。
 *
 * `worker-mailer` は内部で `cloudflare:sockets` を静的に import するため、Bun のテスト・ローカル起動では
 * 解決できず落ちる。そのため、この関数の中で動的 import し、SMTP を使う分岐でしか読み込まない。
 * Workers は接続をリクエストをまたいで使い回せないので、1 通ごとに接続して、送ったら閉じる。
 */
export type SmtpConfig = {
  host: string;
  port: number;
  /** true: 接続の最初から TLS(465)。false: 平文で始め、サーバーが対応していれば STARTTLS(587) */
  secure: boolean;
  user: string;
  pass: string;
};

export type SmtpMessage = {
  from: string;
  to: string | string[];
  subject: string;
  text: string;
  replyTo?: string;
};

export const SMTP_TIMEOUT_MS = 10_000;

/** `人形使い <a@example.com>` を { name, email } に分ける。アドレスだけならそのまま */
export function parseAddress(value: string): { name?: string; email: string } {
  const m = value.match(/^\s*"?([^"<]*?)"?\s*<([^<>]+)>\s*$/);
  if (!m) return { email: value.trim() };
  const name = m[1]!.trim();
  return name ? { name, email: m[2]!.trim() } : { email: m[2]!.trim() };
}

/**
 * 件名を RFC 2047(UTF-8 の base64)にする。1 語を 75 文字以内に収め、複数語は折り返し(CRLF + 空白)でつなぐ。
 * 文字の途中(サロゲートペア含む)では切らない。ASCII のみならそのまま返す。
 */
export function encodeSubject(subject: string): string {
  if (!/[^\x20-\x7e]/.test(subject)) return subject;
  const words: string[] = [];
  let chunk = "";
  const flush = () => {
    if (chunk) words.push(`=?UTF-8?B?${Buffer.from(chunk, "utf8").toString("base64")}?=`);
    chunk = "";
  };
  for (const ch of subject) {
    // base64 後に 75 - 12(=?UTF-8?B?...?=)= 63 文字以内 → 元のバイト数は 45 まで
    if (Buffer.byteLength(chunk + ch, "utf8") > 45) flush();
    chunk += ch;
  }
  flush();
  return words.join("\r\n ");
}

/** エラーの文面からパスワードを取り除く(サーバーの応答にも含まれうるため念のため) */
export function redact(message: string, pass: string): string {
  return pass ? message.split(pass).join("***") : message;
}

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  let timer: ReturnType<typeof setTimeout>;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error(`SMTP が ${ms / 1000} 秒以内に完了しませんでした`)), ms);
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}

export async function sendSmtp(config: SmtpConfig, message: SmtpMessage): Promise<void> {
  try {
    const { WorkerMailer } = await import("worker-mailer");
    const reply = message.replyTo ? parseAddress(message.replyTo) : undefined;
    await withTimeout(
      WorkerMailer.send(
        {
          host: config.host,
          port: config.port,
          secure: config.secure,
          credentials: { username: config.user, password: config.pass },
          authType: ["plain", "login"],
          socketTimeoutMs: SMTP_TIMEOUT_MS,
          responseTimeoutMs: SMTP_TIMEOUT_MS,
        },
        {
          from: parseAddress(message.from),
          to: message.to,
          ...(reply ? { reply } : {}),
          // 件名は自前で折り返し付きの RFC 2047 にする(worker-mailer 標準の Q エンコードは折り返さないため)
          subject: message.subject,
          headers: { Subject: encodeSubject(message.subject) },
          text: message.text,
        }
      ),
      SMTP_TIMEOUT_MS * 2
    );
  } catch (e) {
    const raw = e instanceof Error ? e.message : String(e);
    throw new Error(redact(raw, config.pass));
  }
}
