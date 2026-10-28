import { describe, expect, test } from 'bun:test'
import { dotSize } from './dot-field'

describe('dotSize', () => {
  test('同じ入力には、同じ大きさを返す(星の位置が、描くたびに変わらない)', () => {
    expect(dotSize(0.3, 0.1, 5, 12, 3)).toBe(dotSize(0.3, 0.1, 5, 12, 3))
  })

  test('手前の山は、空より大きな点になる', () => {
    expect(dotSize(0.2, 0.95, 0, 5, 20)).toBeGreaterThan(dotSize(0.2, 0.05, 0, 5, 1))
  })

  test('月の中は、まわりの空より大きな点になる', () => {
    expect(dotSize(0.76, 0.26, 0, 20, 5)).toBeGreaterThan(dotSize(0.4, 0.26, 0, 10, 5))
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
