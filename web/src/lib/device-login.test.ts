import { describe, expect, test } from 'bun:test'
import {
  deviceErrorMessage,
  formatUserCode,
  isCompleteUserCode,
  normalizeUserCode,
} from './device-login'

describe('normalizeUserCode', () => {
  test('英数字だけを、大文字で取り出す', () => {
    expect(normalizeUserCode('abcd-efgh')).toBe('ABCDEFGH')
    expect(normalizeUserCode(' AB CD  EF gh ')).toBe('ABCDEFGH')
    expect(normalizeUserCode('ab_cd.12')).toBe('ABCD12')
  })
  test('空は空', () => {
    expect(normalizeUserCode('')).toBe('')
    expect(normalizeUserCode('--  ')).toBe('')
  })
})

describe('formatUserCode', () => {
  test('8 文字は、4 文字ずつハイフンで区切る', () => {
    expect(formatUserCode('abcdefgh')).toBe('ABCD-EFGH')
    expect(formatUserCode('ABCD-EFGH')).toBe('ABCD-EFGH')
  })
  test('4 文字以下は、区切らない', () => {
    expect(formatUserCode('abc')).toBe('ABC')
    expect(formatUserCode('abcd')).toBe('ABCD')
  })
  test('入力の途中でも、読みやすく区切る', () => {
    expect(formatUserCode('abcde')).toBe('ABCD-E')
  })
})

describe('isCompleteUserCode', () => {
  test('英数字が 8 文字なら、送れる', () => {
    expect(isCompleteUserCode('ABCD-EFGH')).toBe(true)
    expect(isCompleteUserCode('abcdefgh')).toBe(true)
  })
  test('足りない・多すぎるときは、送れない', () => {
    expect(isCompleteUserCode('ABCD-EFG')).toBe(false)
    expect(isCompleteUserCode('ABCDEFGHI')).toBe(false)
    expect(isCompleteUserCode('')).toBe(false)
  })
})

describe('deviceErrorMessage', () => {
  test('知っているコードは、日本語の説明にする(英語のメッセージは出さない)', () => {
    for (const code of [
      'invalid_request',
      'expired_token',
      'device_code_already_processed',
      'access_denied',
      'unauthorized',
    ]) {
      const m = deviceErrorMessage(code)
      expect(m).not.toMatch(/[A-Za-z]{6,}\s[A-Za-z]{3,}/)
      expect(m.length).toBeGreaterThan(10)
    }
  })
  test('期限切れは、login をやり直すよう案内する', () => {
    expect(deviceErrorMessage('expired_token')).toContain('login')
  })
  test('知らないコード・無いときは、汎用の文', () => {
    expect(deviceErrorMessage('something_else')).toBe(deviceErrorMessage(undefined))
  })
})
