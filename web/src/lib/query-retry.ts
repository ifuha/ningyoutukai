import { ApiError } from '#/lib/api'

// 取得(GET)の再試行の決まり。
// 一時的な失敗(Workers の CPU 時間の上限、通信の失敗、5xx)は、少し待って、もう一度試す。
// 利用者の操作で直らない失敗(ログインしていない 401、見つからない 404、権限がない 403、入力の誤り 4xx)は、すぐ失敗にする。
// 取得は何度呼んでも結果が変わらないので、再試行してよい(書き込みには使わない)

/** 再試行する回数の上限(最初の 1 回に加えて) */
export const MAX_RETRIES = 2

/** react-query の `retry` に渡す。`failureCount` は、これまでに失敗した回数 */
export function retryTransient(failureCount: number, error: Error): boolean {
  if (failureCount >= MAX_RETRIES) return false
  if (error instanceof ApiError && error.status >= 400 && error.status < 500) return false
  return true
}

/** 再試行までの待ち時間(ミリ秒)。1 回目 500ms、2 回目 1000ms */
export function retryDelay(failureCount: number): number {
  return Math.min(1000, 500 * 2 ** failureCount)
}
