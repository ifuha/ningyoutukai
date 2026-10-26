import { describe, expect, test } from 'bun:test'
import {
  LABEL_BAND_PX,
  LABEL_MAX_WIDTH,
  LABEL_MIN_WIDTH,
  LABEL_TEXT_LEFT_PX,
  labelHitRect,
  labelTextRect,
  labelWidth,
  confirmPanelOffset,
} from './section-label'

describe('labelWidth(名前の幅)', () => {
  test('広いセクションでは上限(160)、狭いセクションでは下限(40)', () => {
    expect(labelWidth(300)).toBe(160)
    expect(labelWidth(10_000)).toBe(LABEL_MAX_WIDTH)
    expect(labelWidth(40)).toBe(LABEL_MIN_WIDTH)
    expect(labelWidth(1)).toBe(LABEL_MIN_WIDTH)
  })
  test('中間は、セクションの幅そのまま(「⋯」のボタンを消したので、メニューの分の空きは引かない)', () => {
    expect(labelWidth(80)).toBe(80)
    expect(labelWidth(150)).toBe(150)
    expect(labelWidth(200)).toBe(160)
  })
  test('数でない値でも、落ちずに下限になる', () => {
    expect(labelWidth(Number.NaN)).toBe(LABEL_MIN_WIDTH)
    expect(labelWidth(Number.POSITIVE_INFINITY)).toBe(LABEL_MIN_WIDTH)
  })
})

describe('名前の位置(Figma: 枠の上の左に置く文字。上辺の上の 16px の帯)', () => {
  test('文字は、外側の左端から 6px、上辺の 16px 上から始まり、高さは帯と同じ(16px)', () => {
    const r = labelTextRect(300)
    expect(r.left).toBe(LABEL_TEXT_LEFT_PX)
    expect(r.top).toBe(-LABEL_BAND_PX)
    expect(r.height).toBe(LABEL_BAND_PX)
    expect(r.width).toBe(160 - LABEL_TEXT_LEFT_PX)
  })
  test('文字は、上辺より下(セクションの内側)に入らない', () => {
    for (const w of [50, 80, 300, 5000]) {
      const r = labelTextRect(w)
      expect(r.top + r.height).toBeLessThanOrEqual(0)
    }
  })
  test('つかむ場所は、文字の帯を含み、上下に 4px ずつ広がる(中心は帯の中心と同じ)', () => {
    const text = labelTextRect(300)
    const hit = labelHitRect(300)
    expect(hit.left).toBeLessThanOrEqual(text.left)
    expect(hit.left + hit.width).toBeGreaterThanOrEqual(text.left + text.width)
    expect(hit.top).toBeLessThan(text.top)
    expect(hit.top + hit.height).toBeGreaterThan(text.top + text.height)
    expect(hit.top + hit.height / 2).toBe(text.top + text.height / 2)
  })
  test('つかむ場所の幅は、名前の幅と同じ(セクションの幅を超えない)', () => {
    for (const w of [80, 150, 300]) expect(labelHitRect(w).width).toBe(labelWidth(w))
  })
})

describe('削除の確認の表示の位置(「⋯」のボタンは無い)', () => {
  test('名前をつかむ場所の、すぐ下の左端', () => {
    const hit = labelHitRect(300)
    expect(confirmPanelOffset(300)).toEqual({ left: hit.left, top: hit.top + hit.height })
  })
  test('名前をつかむ場所に重ならない(その下から始まる)', () => {
    for (const w of [80, 120, 300]) {
      const hit = labelHitRect(w)
      expect(confirmPanelOffset(w).top).toBeGreaterThanOrEqual(hit.top + hit.height)
    }
  })
})
