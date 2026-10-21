import { describe, expect, test } from 'bun:test'
import {
  clampPan,
  clampScale,
  fitView,
  MAX_ZOOM,
  MIN_ZOOM,
  revealDelta,
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
  test('上下に重ねる見出し・操作バーの分を避けて収める', () => {
    const v = fitView({ cw: 800, ch: 600, w: 200, h: 1000, top: 100, bottom: 50 })
    expect(v.scale).toBeCloseTo((600 - 150 - 32) / 1000)
    expect(v.y).toBe(116)
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

describe('revealDelta', () => {
  const area = { width: 800, height: 600 }
  const box = (left: number, top: number, w = 100, h = 40) => ({
    left,
    top,
    right: left + w,
    bottom: top + h,
  })
  test('収まっているときは 0', () => {
    expect(revealDelta(box(100, 100), area)).toEqual({ dx: 0, dy: 0 })
  })
  test('左にはみ出すと、余白 16px の位置まで右へ', () => {
    expect(revealDelta(box(-200, 100), area)).toEqual({ dx: 216, dy: 0 })
  })
  test('右にはみ出すと、余白 16px の位置まで左へ', () => {
    expect(revealDelta(box(900, 100), area).dx).toBe(800 - 16 - 1000)
  })
  test('上と下にはみ出すとき', () => {
    expect(revealDelta(box(100, -50), area).dy).toBe(66)
    expect(revealDelta(box(100, 700), area).dy).toBe(600 - 16 - 740)
  })
  test('上に重なる見出しの下に隠れる位置は、見出しの下まで動かす', () => {
    expect(revealDelta(box(100, 60), area, 16, { top: 100 }).dy).toBe(56)
    expect(revealDelta(box(100, 130), area, 16, { top: 100 }).dy).toBe(0)
  })
  test('下の操作バーに重なる位置も避ける', () => {
    expect(revealDelta(box(100, 540), area, 16, { bottom: 50 }).dy).toBe(
      600 - 16 - 50 - 580,
    )
  })
  test('余白の内側(端ぎりぎり)も動かす', () => {
    expect(revealDelta(box(4, 100), area).dx).toBe(12)
  })
  test('領域より大きい要素は、左上を余白に合わせる', () => {
    expect(revealDelta(box(-300, -100, 1000, 800), area)).toEqual({
      dx: 316,
      dy: 116,
    })
  })
  test('移動範囲の制限を通しても、要素の一部は領域に残る', () => {
    const size = { cw: 800, ch: 600, w: 1000, h: 300 }
    const d = revealDelta(box(5000, 100), area)
    const v = clampPan({ x: d.dx, y: 0, scale: 1 }, size)
    expect(v.x).toBe(80 - 1000)
  })
})
