import { describe, expect, test } from 'bun:test'
import { displayWidth, formatDateTime, padEnd, renderTable, shortId, truncate } from './format'

describe('displayWidth', () => {
  test('半角は 1、全角(漢字・かな・全角記号)は 2', () => {
    expect(displayWidth('abc')).toBe(3)
    expect(displayWidth('人形使い')).toBe(8)
    expect(displayWidth('ABC人')).toBe(5)
    expect(displayWidth('ＡＢ')).toBe(4)
    expect(displayWidth('')).toBe(0)
  })
})

describe('padEnd / truncate', () => {
  test('表示の幅で、空白を足す', () => {
    expect(padEnd('人形', 6)).toBe('人形  ')
    expect(padEnd('abc', 5)).toBe('abc  ')
    expect(padEnd('long-text', 3)).toBe('long-text')
  })
  test('幅を超えるときは、末尾を … にして切る(全角を途中で割らない)', () => {
    expect(truncate('短い', 10)).toBe('短い')
    expect(truncate('これは長いタスク名です', 10)).toBe('これは長…')
    expect(displayWidth(truncate('これは長いタスク名です', 10))).toBeLessThanOrEqual(10)
    expect(truncate('abcdefghij', 5)).toBe('abcd…')
  })
})

describe('renderTable', () => {
  test('列の幅をそろえる(全角混じりでも、表示の幅で)。末尾の空白は付けない', () => {
    const out = renderTable([
      ['名前', '状態'],
      ['人形使い', '作業中'],
      ['abc', '完了'],
    ])
    const lines = out.split('\n')
    // 2 列目の開始位置が、すべての行で同じ表示幅になる
    const starts = lines.map((l) => displayWidth(l.slice(0, l.indexOf(l.includes('状態') ? '状態' : l.includes('作業中') ? '作業中' : '完了'))))
    expect(new Set(starts).size).toBe(1)
    for (const l of lines) expect(l).toBe(l.trimEnd())
  })
  test('最大幅を指定した列は、切る', () => {
    const out = renderTable([['A', 'B'], ['とても長い名前のプロダクトです', 'x']], [10, undefined])
    expect(out).toContain('…')
  })
  test('空なら空', () => {
    expect(renderTable([])).toBe('')
  })
})

describe('formatDateTime / shortId', () => {
  test('日時は、この端末のタイムゾーンの YYYY-MM-DD HH:mm', () => {
    const d = new Date(2030, 0, 5, 9, 7) // ローカル時刻で作る
    expect(formatDateTime(d.toISOString())).toBe('2030-01-05 09:07')
  })
  test('無い・不正なら -', () => {
    expect(formatDateTime(null)).toBe('-')
    expect(formatDateTime(undefined)).toBe('-')
    expect(formatDateTime('not a date')).toBe('-')
  })
  test('ID は先頭 8 文字', () => {
    expect(shortId('3f2a9c10-aaaa-bbbb-cccc-1234567890ab')).toBe('3f2a9c10')
  })
})
