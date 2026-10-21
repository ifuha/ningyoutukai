import { describe, expect, test } from 'bun:test'
import {
  clampPan,
  clampScale,
  fitView,
  MAX_ZOOM,
  MIN_ZOOM,
  zoomAt,
} from './pan-zoom'

const size = { cw: 800, ch: 600, w: 1000, h: 300 }

describe('fitView', () => {
  test('広い中身は、幅(余白を除く)に合わせて縮小し、横を中央に置く', () => {
    const v = fitView(size)
    expect(v.scale).toBeCloseTo((800 - 32) / 1000)
    expect(v.x).toBeCloseTo((800 - 1000 * v.scale) / 2)
    expect(v.y).toBe(16)
  })
  test('小さい中身は拡大しない', () => {
    expect(fitView({ cw: 800, ch: 600, w: 200, h: 100 }).scale).toBe(1)
  })
  test('背が高い中身は、高さにも合わせる', () => {
    expect(fitView({ cw: 800, ch: 400, w: 200, h: 1000 }).scale).toBeCloseTo(
      (400 - 32) / 1000,
    )
  })
})

describe('zoomAt', () => {
  const view = { x: 40, y: 20, scale: 0.5 }
  test('指定した点の下にある中身の位置が変わらない', () => {
    const p = { x: 300, y: 200 }
    const next = zoomAt(view, p, 1, size, 0.5)
    expect((p.x - next.x) / next.scale).toBeCloseTo((p.x - view.x) / view.scale)
    expect((p.y - next.y) / next.scale).toBeCloseTo((p.y - view.y) / view.scale)
  })
  test('倍率は fit の 0.25 倍〜4 倍に収まる', () => {
    const p = { x: 400, y: 300 }
    expect(zoomAt(view, p, 100, size, 0.5).scale).toBeCloseTo(0.5 * MAX_ZOOM)
    expect(zoomAt(view, p, 0.0001, size, 0.5).scale).toBeCloseTo(0.5 * MIN_ZOOM)
    expect(clampScale(1, 0.5)).toBe(1)
  })
})

describe('clampPan', () => {
  const v = { x: 0, y: 0, scale: 1 }
  test('範囲内ならそのまま', () => {
    expect(clampPan({ ...v, x: 100, y: 50 }, size)).toEqual({
      ...v,
      x: 100,
      y: 50,
    })
  })
  test('左へ出しすぎても、右の 80px は残る', () => {
    expect(clampPan({ ...v, x: -5000 }, size).x).toBe(80 - 1000)
  })
  test('右へ出しすぎても、左の 80px は領域に残る', () => {
    expect(clampPan({ ...v, x: 5000 }, size).x).toBe(800 - 80)
  })
  test('上下も同様', () => {
    expect(clampPan({ ...v, y: -5000 }, size).y).toBe(80 - 300)
    expect(clampPan({ ...v, y: 5000 }, size).y).toBe(600 - 80)
  })
  test('中身が 80px より小さいときは、その大きさ分は残る', () => {
    const r = clampPan({ x: -5000, y: 0, scale: 1 }, { ...size, w: 50 })
    expect(r.x).toBe(0)
  })
})
