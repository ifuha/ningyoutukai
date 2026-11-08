import { describe, expect, test } from 'bun:test'
import { isDrag, MOVE_THRESHOLD, moveBy, settle } from './use-offset-drag'

// つかんで動かす部品の、位置の計算

describe('moveBy', () => {
  test('画面の動きを、拡大率で割ったぶんだけ動く', () => {
    expect(moveBy({ x: 10, y: 20 }, 30, -40, 1)).toEqual({ x: 40, y: -20 })
    expect(moveBy({ x: 0, y: 0 }, 100, 50, 2)).toEqual({ x: 50, y: 25 })
    expect(moveBy({ x: 0, y: 0 }, 30, 30, 0.5)).toEqual({ x: 60, y: 60 })
  })
  test('拡大率が 0 以下でも壊れない(1 として扱う)', () => {
    expect(moveBy({ x: 1, y: 1 }, 10, 10, 0)).toEqual({ x: 11, y: 11 })
    expect(moveBy({ x: 1, y: 1 }, 10, 10, -2)).toEqual({ x: 11, y: 11 })
  })
})

describe('isDrag', () => {
  test('しきい値より小さい動きはクリック。以上ならドラッグ', () => {
    expect(isDrag(1, 1)).toBe(false)
    expect(isDrag(MOVE_THRESHOLD, 0)).toBe(true)
    expect(isDrag(2, 2)).toBe(false) // √8 ≈ 2.83 は、3 に届かない
    expect(isDrag(3, 3)).toBe(true)
    expect(isDrag(3, 0)).toBe(true)
  })
})

describe('settle', () => {
  test('保存する値は整数(px)に丸める', () => {
    expect(settle({ x: 10.4, y: -3.6 })).toEqual({ x: 10, y: -4 })
  })
})
