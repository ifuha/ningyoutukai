import { describe, expect, test } from 'bun:test'
import { settingsSections } from './settings-sections'

describe('settingsSections', () => {
  test('1 つ以上ある(設定の画面が、空にならない)', () => {
    expect(settingsSections.length).toBeGreaterThan(0)
  })

  test('id が重複しない', () => {
    const ids = settingsSections.map((s) => s.id)
    expect(new Set(ids).size).toBe(ids.length)
  })

  test('名前と id が、空ではない', () => {
    for (const s of settingsSections) {
      expect(s.id.trim()).not.toBe('')
      expect(s.label.trim()).not.toBe('')
    }
  })

  test('最初のカテゴリは一般(開いたとき、最初に出る)。外観・AI のトークンも、ある', () => {
    expect(settingsSections[0]!.id).toBe('general')
    expect(settingsSections.map((s) => s.id)).toEqual(expect.arrayContaining(['appearance', 'ai-token']))
  })
})