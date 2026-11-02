import { describe, expect, test } from 'bun:test'
import { shouldClearCache } from './cache-owner'

describe('shouldClearCache(ユーザーが変わったら、キャッシュを消す)', () => {
  test('ページを開いた直後(まだ確認していない)は、消さない。ログイン中でも未ログインでも', () => {
    expect(shouldClearCache(undefined, 'user-a')).toBe(false)
    expect(shouldClearCache(undefined, null)).toBe(false)
  })

  test('同じユーザーのままなら、消さない(再確認・取り直しのたびに消えない)', () => {
    expect(shouldClearCache('user-a', 'user-a')).toBe(false)
    expect(shouldClearCache(null, null)).toBe(false)
  })

  test('ログアウト(ユーザー → 未ログイン)・セッション切れは、消す', () => {
    expect(shouldClearCache('user-a', null)).toBe(true)
  })

  test('別のユーザーに変わったら、消す(未ログインを挟まなくても)', () => {
    expect(shouldClearCache('user-a', 'user-b')).toBe(true)
  })

  test('未ログイン → ログインでも、消す(未ログインのあいだに溜まったものを、持ち込まない)', () => {
    expect(shouldClearCache(null, 'user-a')).toBe(true)
  })
})
