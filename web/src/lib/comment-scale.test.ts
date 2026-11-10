import { describe, expect, test } from 'bun:test'
import { COMMENT_PIN_PX, commentPlaceOffset, commentScaleStyle } from './comment-scale'
import { LABEL_FACTOR_MAX } from './section-label'

// コメントの拡大縮小(セクションの名前と同じ: 縮小しても読める大きさを保ち、拡大は比例)

describe('commentScaleStyle', () => {
  test('拡大・等倍は付けない(キャンバスの拡大に比例)。縮小は、左上を起点に 1 / scale 倍', () => {
    expect(commentScaleStyle(1)).toBeUndefined()
    expect(commentScaleStyle(3)).toBeUndefined()
    expect(commentScaleStyle(0.5)).toEqual({ transform: 'scale(2)', transformOrigin: 'top left' })
    expect(commentScaleStyle(0.25)).toEqual({ transform: 'scale(4)', transformOrigin: 'top left' })
  })
  test('極端に縮小しても、係数は上限まで。壊れた入力は付けない', () => {
    expect(commentScaleStyle(0.01)?.transform).toBe(`scale(${LABEL_FACTOR_MAX})`)
    for (const bad of [0, -1, NaN, Infinity]) expect(commentScaleStyle(bad)).toBeUndefined()
  })
  test('画面上の大きさ: 縮小してもピンは等倍のまま(32px)。拡大は比例', () => {
    const factor = (scale: number) => Number(/scale\((.+)\)/.exec(commentScaleStyle(scale)?.transform ?? 'scale(1)')![1])
    const screenPx = (scale: number) => COMMENT_PIN_PX * factor(scale) * scale
    expect(screenPx(0.5)).toBe(32)
    expect(screenPx(0.25)).toBe(32)
    expect(screenPx(2)).toBe(64)
  })
})

describe('commentPlaceOffset', () => {
  test('置いた点がピンの中心になる: 半分(キャンバスの単位)。縮小では、係数ぶん大きい', () => {
    expect(commentPlaceOffset(1)).toBe(16)
    expect(commentPlaceOffset(2)).toBe(16)
    expect(commentPlaceOffset(0.5)).toBe(32)
  })
})
