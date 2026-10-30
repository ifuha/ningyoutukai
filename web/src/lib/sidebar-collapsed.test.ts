import { describe, expect, test } from 'bun:test'
import { parseCollapsed, serializeCollapsed } from './sidebar-collapsed'

describe('サイドバーの開閉の保存', () => {
  test("'1' のときだけ、たたむ", () => {
    expect(parseCollapsed('1')).toBe(true)
    expect(parseCollapsed('0')).toBe(false)
  })
  test('無い値・壊れた値は、開いたまま', () => {
    expect(parseCollapsed(null)).toBe(false)
    expect(parseCollapsed(undefined)).toBe(false)
    expect(parseCollapsed('true')).toBe(false)
  })
  test('保存した値を、読み戻せる', () => {
    expect(parseCollapsed(serializeCollapsed(true))).toBe(true)
    expect(parseCollapsed(serializeCollapsed(false))).toBe(false)
  })
})
