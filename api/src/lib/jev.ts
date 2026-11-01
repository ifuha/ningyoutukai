/**
 * Jev(TypeSafe AI の判断モデル)の呼び出し。`POST https://api.typesafe.ai/v1/systemone`。
 * Jev は文章を作らず、質問ごとに「選んだ候補・確信度・全候補の確率」を返す(docs/v3.0/jev-assign.md)。
 *
 * - `TYPESAFE_API_KEY` が無いときは呼ばず、`not-configured` で失敗する(他の機能には影響しない)
 * - モデルの版は `JEV_MODEL`(既定 `jev-1.14.0`)。`jev-latest` は中身が変わるので使わない
 * - 429 は `retry-after` に従って 1 回だけやり直す。タイムアウトは 10 秒
 *
 * テストでは `spyOn(jev, "ask")` で差し替えて、実際には呼ばずに検証する(`mailer` と同じ流儀)。
 */
export const DEFAULT_JEV_MODEL = "jev-1.14.0";
const DEFAULT_JEV_URL = "https://api.typesafe.ai/v1/systemone";
const TIMEOUT_MS = 10_000;
const MAX_RETRY_WAIT_MS = 5_000;

/** `choice`: 候補(`criteria` のキー)から 1 つ選ぶ質問。1〜255 候補 */
export type JevChoiceQuestion = {
  type: "choice";
  instructions: string;
  criteria: Record<string, string>;
};

export type JevRequest = {
  /** 質問が参照する内容。質問のあいだで共有される */
  state: unknown;
  questions: Record<string, JevChoiceQuestion>;
};

export type JevChoiceAnswer = {
  type: "choice";
  /** いちばん確率の高い候補 */
  choice: string;
  confidence: number | null;
  /** すべての候補の確率 */
  probabilities: Record<string, number>;
};

export type JevResponse = {
  /** 実際に答えたモデルの版(別名で頼んだときは、版に解決された名前) */
  model: string;
  answers: Record<string, JevChoiceAnswer | { type: string }>;
  usage: { input_tokens: number; output_tokens: number };
};

/** 失敗の種類。`not-configured` は設定の問題、それ以外は Jev 側・通信の問題 */
export type JevErrorKind = "not-configured" | "rate-limited" | "timeout" | "upstream";

export class JevError extends Error {
  constructor(
    readonly kind: JevErrorKind,
    message: string,
  ) {
    super(message);
    this.name = "JevError";
  }
}

export const jev = {
  /** 質問を送って答えを得る。失敗は `JevError` を投げる */
  async ask(request: JevRequest): Promise<JevResponse> {
    const apiKey = process.env.TYPESAFE_API_KEY;
    if (!apiKey) throw new JevError("not-configured", "TYPESAFE_API_KEY が未設定です");

    const body = JSON.stringify({
      model: process.env.JEV_MODEL || DEFAULT_JEV_MODEL,
      state: request.state,
      questions: request.questions,
    });
    const url = process.env.JEV_API_URL || DEFAULT_JEV_URL;

    for (let attempt = 0; ; attempt++) {
      const res = await post(url, apiKey, body);
      if (res.status === 429 && attempt === 0) {
        await sleep(retryAfterMs(res.headers.get("retry-after")));
        continue;
      }
      if (res.status === 429) throw new JevError("rate-limited", "Jev のレート制限に達しました");
      if (!res.ok) {
        // 理由は返ってくるが、利用者には見せない(ログにだけ残す)
        const detail = (await res.text().catch(() => "")).slice(0, 500);
        console.error(`[jev] ${res.status}: ${detail}`);
        throw new JevError("upstream", `Jev がエラーを返しました(${res.status})`);
      }
      const json = (await res.json().catch(() => undefined)) as JevResponse | undefined;
      if (!json || typeof json !== "object" || !json.answers) {
        throw new JevError("upstream", "Jev の応答の形が想定と違います");
      }
      return json;
    }
  },
};

async function post(url: string, apiKey: string, body: string): Promise<Response> {
  try {
    return await fetch(url, {
      method: "POST",
      headers: { authorization: `Bearer ${apiKey}`, "content-type": "application/json" },
      body,
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
  } catch (e) {
    if (e instanceof Error && (e.name === "TimeoutError" || e.name === "AbortError")) {
      throw new JevError("timeout", "Jev の応答がありませんでした(タイムアウト)");
    }
    const message = e instanceof Error ? e.message : String(e);
    console.error(`[jev] ${message}`);
    throw new JevError("upstream", "Jev に接続できませんでした");
  }
}

/** `retry-after`(秒)を待ち時間(ms)にする。読めないときは 1 秒。待ちすぎないよう上限がある */
function retryAfterMs(header: string | null): number {
  const seconds = Number(header);
  if (header === null || !Number.isFinite(seconds) || seconds < 0) return 1_000;
  return Math.min(seconds * 1_000, MAX_RETRY_WAIT_MS);
}

const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));
