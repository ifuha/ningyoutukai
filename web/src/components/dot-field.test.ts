import { describe, expect, test } from 'bun:test'
import { dotSize, edgeFade, layoutFor } from './dot-field'

describe('dotSize', () => {
  test('同じ入力には、同じ大きさを返す', () => {
    expect(dotSize(0.3, 0.7, 5)).toBe(dotSize(0.3, 0.7, 5))
  })

  test('手前の山は、奥の山より大きな点になる', () => {
    expect(dotSize(0.2, 0.98, 0)).toBeGreaterThan(dotSize(0.2, 0.5, 0))
  })

  test('空には、何も描かない', () => {
    for (const nx of [0.1, 0.4, 0.76, 0.9]) {
      expect(dotSize(nx, 0.02, 0)).toBe(0)
      expect(dotSize(nx, 0.1, 12)).toBe(0)
    }
  })

  test('大きさは、いつも 0〜1 に収まる', () => {
    for (let gx = 0; gx < 40; gx++) {
      for (let gy = 0; gy < 30; gy++) {
        for (const t of [0, 1.7, 33]) {
          const v = dotSize(gx / 40, gy / 30, t)
          expect(v).toBeGreaterThanOrEqual(0)
          expect(v).toBeLessThanOrEqual(1)
        }
      }
    }
  })
})

describe('layoutFor', () => {
  test('1000〜1719px は 1 マス 16px で、絵の横幅は画面の幅いっぱい', () => {
    expect(layoutFor(1440)).toEqual({ step: 16, designWidth: 1440 })
    expect(layoutFor(1000)).toEqual({ step: 16, designWidth: 1000 })
    expect(layoutFor(1719)).toEqual({ step: 16, designWidth: 1719 })
  })

  test('1720px 以上は 1 マス 22px で、絵の横幅は画面の幅いっぱい(広い画面でも両側に隙間を作らない)', () => {
    expect(layoutFor(1720)).toEqual({ step: 22, designWidth: 1720 })
    expect(layoutFor(2560)).toEqual({ step: 22, designWidth: 2560 })
    expect(layoutFor(3840)).toEqual({ step: 22, designWidth: 3840 })
  })

  test('1000px 未満は、絵の全体が収まるよう、幅に合わせて縮める', () => {
    expect(layoutFor(900)).toEqual({ step: 10, designWidth: 900 })
    expect(layoutFor(300)).toEqual({ step: 9, designWidth: 300 })
  })
})

describe('edgeFade', () => {
  test('中央では消えず、端では 0 になる', () => {
    expect(edgeFade(0.5, 0.5)).toBe(1)
    expect(edgeFade(0, 0.5)).toBe(0)
    expect(edgeFade(1, 0.5)).toBe(0)
    expect(edgeFade(0.5, 1)).toBe(0)
  })

  test('端に近いほど薄い', () => {
    expect(edgeFade(0.02, 0.5)).toBeLessThan(edgeFade(0.04, 0.5))
    expect(edgeFade(0.5, 0.95)).toBeLessThan(edgeFade(0.5, 0.85))
  })

  test('いつも 0〜1 に収まる', () => {
    for (let i = 0; i <= 20; i++) {
      for (let j = 0; j <= 20; j++) {
        const v = edgeFade(i / 20, j / 20)
        expect(v).toBeGreaterThanOrEqual(0)
        expect(v).toBeLessThanOrEqual(1)
      }
    }
  })
})
