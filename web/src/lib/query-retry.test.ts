import { describe, expect, test } from 'bun:test'
import { ApiError } from './api'
import { MAX_RETRIES, retryDelay, retryTransient } from './query-retry'

describe('retryTransient', () => {
  test('一時的な失敗(通信の失敗・CPU の上限・5xx)は、上限まで再試行する', () => {
    expect(retryTransient(0, new TypeError('Failed to fetch'))).toBe(true)
    expect(retryTransient(1, new ApiError(500, 'エラーが発生しました'))).toBe(true)
    expect(retryTransient(0, new ApiError(503, ''))).toBe(true)
    expect(retryTransient(0, new Error('Worker exceeded CPU time limit'))).toBe(true)
  })

  test('上限(2 回)を超えたら、再試行しない', () => {
    expect(MAX_RETRIES).toBe(2)
    expect(retryTransient(2, new ApiError(500, ''))).toBe(false)
    expect(retryTransient(5, new TypeError('x'))).toBe(false)
  })

  test('利用者の操作で直らない失敗(4xx)は、再試行しない', () => {
    for (const status of [400, 401, 403, 404, 409, 422]) {
      expect(retryTransient(0, new ApiError(status, ''))).toBe(false)
    }
  })
})

describe('retryDelay', () => {
  test('1 回目 500ms、2 回目 1000ms。それ以上は 1000ms', () => {
    expect(retryDelay(0)).toBe(500)
    expect(retryDelay(1)).toBe(1000)
    expect(retryDelay(4)).toBe(1000)
  })
})
