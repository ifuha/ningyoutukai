import { treaty, type Treaty } from '@elysiajs/eden'
// api の型だけを読む(`import type`)。実行時のコードは web のバンドルに入らない。
// `elysia` の型は、api の node_modules のものを読む(`tsconfig.json` の `paths`。web と api で別の複製だと型が合わない)
import type { app } from '../../../api/src/app'
import { API_URL, ApiError } from '#/lib/api'

type App = typeof app

let client: ReturnType<typeof createClient> | undefined

/** Eden クライアントを作る。ベース URL が空文字(本番の同一オリジン)のときは、現在のオリジンを使う(Eden は空文字を `https://` にしてしまう) */
export function createClient(baseUrl: string, config: Treaty.Config = {}) {
  return treaty<App>(baseUrl || window.location.origin, {
    fetch: { credentials: 'include' },
    // 日時を `Date` に変えない。api は日時を ISO 文字列で返し、web は文字列のまま扱う。
    // 既定の true だと、「2026-10-01」のようなタスク名や説明まで、勝手に `Date` に変わってしまう
    parseDate: false,
    ...config,
    fetcher: (input, init) => fetchWithSafeErrorBody(config.fetcher ?? fetch, input, init),
  })
}

/**
 * エラー応答(2xx 以外)で、`Content-Type` が JSON なのに本文が JSON として読めない(壊れている、空)とき、
 * 本文を `text/plain` に付け替えて返す。Eden は JSON と宣言された本文が読めないと、`SyntaxError` を呼び出し側に投げてしまい、
 * どの状態だったか(`status`)も失われる。付け替えれば、Eden は `error.value` を文字列にして、`status` も残る。成功の応答は触らない
 */
async function fetchWithSafeErrorBody(
  base: typeof fetch,
  input: Parameters<typeof fetch>[0],
  init?: Parameters<typeof fetch>[1],
) {
  const res = await base(input, init)
  if (res.ok || !res.headers.get('content-type')?.startsWith('application/json')) return res
  const text = await res.clone().text()
  try {
    JSON.parse(text)
    return res
  } catch {
    const headers = new Headers(res.headers)
    headers.set('content-type', 'text/plain')
    headers.delete('content-length')
    headers.delete('content-encoding')
    return new Response(text === '' ? null : text, { status: res.status, statusText: res.statusText, headers })
  }
}

/**
 * api の Eden クライアント(型は api の `app` から取る)。ベース URL は `api.ts` の `API_URL` と同じ。
 * ブラウザで初めて呼ぶときに作る(空文字のとき `window` を使うので、SSR のモジュール読み込みでは作れない)
 */
export function eden() {
  client ??= createClient(API_URL)
  return client
}

/** JSON を通ったあとの型: `Date` は ISO 文字列になる(Eden の型は `Date` のまま。`parseDate: false` と合わせる) */
export type Json<T> = T extends Date
  ? string
  : T extends readonly (infer U)[]
    ? Json<U>[]
    : T extends object
      ? { [K in keyof T]: Json<T[K]> }
      : T

type EdenResult = { data: unknown; error: unknown; status?: number }

type SuccessData<R extends EdenResult> = NonNullable<Extract<R, { error: null }>['data']>
/** 成功の本文の型。本文なし(204。Eden の型では `undefined`)は `void` */
type EdenData<R extends EdenResult> = [SuccessData<R>] extends [never] ? void : Json<SuccessData<R>>

/**
 * Eden の呼び出しの結果を、`api<T>()` と同じ挙動にする。成功したら本文(`data`)を返し、
 * 失敗したら `ApiError`(`message` は画面に出せる文、`status` は HTTP の状態。通信できなければ 0)を投げる。
 * 401 のときのセッション切れの処理は、いまと同じく `session-expired.ts`(react-query の `handleApiError`)が受ける
 */
export async function edenData<R extends EdenResult>(
  call: Promise<R>,
): Promise<EdenData<R>> {
  const res = await call
  if (res.error === null) {
    // 204(本文なし)は、旧 `api<void>()` と同じく `undefined`(Eden の `data` は空文字になる)
    if (res.status === 204) return undefined as EdenData<R>
    return res.data as EdenData<R>
  }
  const { status, value } = res.error as { status: number; value: unknown }
  // 通信できなかったとき、Eden は 503 と、投げられた `Error` を返す(本物の 503 は、本文が JSON か文字列)
  if (value instanceof Error) {
    throw new ApiError(0, 'サーバーに接続できませんでした。時間をおいて、もう一度お試しください')
  }
  // 本文が JSON でない(502 の HTML、空など)ときは、`value` が文字列になる。そのときは既定の文のまま
  let message = 'エラーが発生しました'
  if (typeof value === 'object' && value !== null) {
    const m = (value as { message?: unknown }).message
    if (typeof m === 'string') message = m
  }
  throw new ApiError(status, message)
}
