import { describe, expect, test } from 'bun:test'
import { AUTO_DELETE_DEFAULT_DAYS, autoDeleteDaysError, describeDays, parseAutoDeleteDays } from './document-setting'

describe('自動削除の日数', () => {
  test('1〜3650 の整数だけ読める(前後の空白は許す)。初期は 7 日', () => {
    expect(AUTO_DELETE_DEFAULT_DAYS).toBe(7)
    expect(parseAutoDeleteDays('7')).toBe(7)
    expect(parseAutoDeleteDays(' 30 ')).toBe(30)
    expect(parseAutoDeleteDays('1')).toBe(1)
    expect(parseAutoDeleteDays('3650')).toBe(3650)
  })
  test('0・3651・小数・負・文字・空は読めない', () => {
    for (const bad of ['0', '3651', '1.5', '-1', 'あ', '7日', '', '  ', '1e3']) expect(parseAutoDeleteDays(bad)).toBeNull()
  })
  test('誤りの文: 空は「入力してください」、範囲外は範囲を示す', () => {
    expect(autoDeleteDaysError('7')).toBeNull()
    expect(autoDeleteDaysError('')).toContain('入力してください')
    expect(autoDeleteDaysError('0')).toContain('1〜3650')
  })
  test('読みやすい文: 7 の倍数は週も添える', () => {
    expect(describeDays(7)).toBe('7 日(1 週間)')
    expect(describeDays(14)).toBe('14 日(2 週間)')
    expect(describeDays(10)).toBe('10 日')
    expect(describeDays(1)).toBe('1 日')
  })
})
