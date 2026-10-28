import { describe, expect, test } from 'bun:test'
import { dotSize, edgeFade, stepFor } from './dot-field'

describe('dotSize', () => {
  test('同じ入力には、同じ大きさを返す(星の位置が、描くたびに変わらない)', () => {
    expect(dotSize(0.3, 0.1, 5, 12, 3)).toBe(dotSize(0.3, 0.1, 5, 12, 3))
  })

  test('手前の山は、空より大きな点になる', () => {
    expect(dotSize(0.2, 0.95, 0, 5, 20)).toBeGreaterThan(dotSize(0.2, 0.05, 0, 5, 1))
  })

  test('空には、月のような大きな塊がない(星でない点は、どこでも同じ小さな大きさ)', () => {
    // hash が 0.965 を超えない格子の位置を選ぶ(星ではない点)
    expect(dotSize(0.76, 0.26, 0, 20, 5)).toBe(dotSize(0.4, 0.26, 0, 10, 5))
  })

  test('大きさは、いつも 0〜1 に収まる', () => {
    for (let gx = 0; gx < 40; gx++) {
      for (let gy = 0; gy < 30; gy++) {
        for (const t of [0, 1.7, 33]) {
          const v = dotSize(gx / 40, gy / 30, t, gx, gy)
          expect(v).toBeGreaterThanOrEqual(0)
          expect(v).toBeLessThanOrEqual(1)
        }
      }
    }
  })
})

describe('stepFor', () => {
  test('画面が広いほど、1 マスが大きい', () => {
    expect(stepFor(1600)).toBeGreaterThan(stepFor(800))
  })

  test('狭すぎても広すぎても、決めた範囲に収まる', () => {
    expect(stepFor(100)).toBe(9)
    expect(stepFor(10000)).toBe(28)
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
    expect(edgeFade(0.05, 0.5)).toBeLessThan(edgeFade(0.1, 0.5))
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
