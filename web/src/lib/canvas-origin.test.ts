import { describe, expect, test } from 'bun:test'
import { compensateOffsetChange, screenPositionOf } from './canvas-origin'
import type { Offset } from './canvas-origin'
import { clientToCanvas } from './canvas-view'
import { canvasBounds } from './tree-layout'
import type { View } from './pan-zoom'

// 固定のシードの乱数(結果が毎回同じになる)
function rng(seed: number) {
  let s = seed >>> 0
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0
    return s / 2 ** 32
  }
}

const view = (x: number, y: number, scale: number): View => ({ x, y, scale })

describe('screenPositionOf', () => {
  test('画面上の位置 = view の平行移動 + (座標 + ずらし量) × 倍率', () => {
    expect(screenPositionOf(view(100, 50, 2), { x: 10, y: 20 }, { x: 30, y: 40 })).toEqual({
      x: 100 + (30 + 10) * 2,
      y: 50 + (40 + 20) * 2,
    })
  })
})

describe('compensateOffsetChange(ずらし量が変わっても、画面が動かない)', () => {
  test('ずらし量が変わらないとき、補正は 0(同じ view を返す)', () => {
    const v = view(120, 80, 0.7)
    const off: Offset = { x: 30, y: 10 }
    expect(compensateOffsetChange(v, off, { ...off })).toBe(v)
  })

  test('ずらし量が増えると、パンを逆向きに「増えた分 × 倍率」だけ動かす', () => {
    const next = compensateOffsetChange(view(100, 100, 2), { x: 0, y: 0 }, { x: 50, y: 20 })
    expect(next).toEqual({ scale: 2, x: 100 - 50 * 2, y: 100 - 20 * 2 })
  })

  test('どの座標も、補正の前後で、画面上の位置が変わらない(拡大率が違っても)', () => {
    const rand = rng(1)
    for (const scale of [0.25, 0.5, 1, 1.7, 4]) {
      for (let i = 0; i < 50; i++) {
        const v = view(rand() * 800 - 400, rand() * 600 - 300, scale)
        const prev = { x: rand() * 500, y: rand() * 500 }
        const next = { x: rand() * 900, y: rand() * 900 }
        const after = compensateOffsetChange(v, prev, next)
        const c = { x: rand() * 4000 - 2000, y: rand() * 4000 - 2000 }
        const before = screenPositionOf(v, prev, c)
        const now = screenPositionOf(after, next, c)
        expect(now.x).toBeCloseTo(before.x, 6)
        expect(now.y).toBeCloseTo(before.y, 6)
        expect(after.scale).toBe(scale)
      }
    }
  })

  test('連続で動かしても、誤差が積み上がらない(最後の画面上の位置が、最初と同じ)', () => {
    const rand = rng(7)
    const v0 = view(37, -12, 1.3)
    let v = v0
    let off: Offset = { x: 0, y: 0 }
    const c = { x: 250, y: -90 }
    const first = screenPositionOf(v0, off, c)
    for (let i = 0; i < 1000; i++) {
      const next = { x: Math.round(rand() * 2000), y: Math.round(rand() * 2000) }
      v = compensateOffsetChange(v, off, next)
      off = next
    }
    const last = screenPositionOf(v, off, c)
    expect(last.x).toBeCloseTo(first.x, 6)
    expect(last.y).toBeCloseTo(first.y, 6)
  })

  test('元のずらし量に戻すと、元の view に戻る(楽観更新の取り消しで、画面が元に戻る)', () => {
    const v0 = view(64, 32, 0.8)
    const off0 = { x: 0, y: 0 }
    const off1 = { x: 300, y: 120 }
    const back = compensateOffsetChange(compensateOffsetChange(v0, off0, off1), off1, off0)
    expect(back.x).toBeCloseTo(v0.x, 9)
    expect(back.y).toBeCloseTo(v0.y, 9)
  })

  test('座標の変換(clientToCanvas)と整合する: 補正の前後で、同じ画面上の点が、同じキャンバス座標を指す', () => {
    const rand = rng(3)
    for (let i = 0; i < 100; i++) {
      const v = view(rand() * 600 - 300, rand() * 600 - 300, 0.5 + rand() * 2)
      const prev = { x: rand() * 400, y: rand() * 400 }
      const next = { x: rand() * 800, y: rand() * 800 }
      const after = compensateOffsetChange(v, prev, next)
      // 領域の左上を、画面の (10, 20) とする。中身の左上の画面上の位置 = 領域の左上 + view の平行移動
      const origin = { x: 10, y: 20 }
      const client = { x: 500 + rand() * 300, y: 400 + rand() * 300 }
      const canvasBefore = clientToCanvas(client, { x: origin.x + v.x, y: origin.y + v.y }, v.scale, prev)
      const canvasAfter = clientToCanvas(
        client,
        { x: origin.x + after.x, y: origin.y + after.y },
        after.scale,
        next,
      )
      expect(canvasAfter.x).toBeCloseTo(canvasBefore.x, 6)
      expect(canvasAfter.y).toBeCloseTo(canvasBefore.y, 6)
    }
  })
})

describe('セクションを負の座標へ動かしたとき(canvasBounds と組み合わせる)', () => {
  const card = { x: 300, y: 200 }
  const section = { x: 100, y: 100, width: 300, height: 400 }

  test('左上へ大きく動かして範囲が変わっても、元の座標にある要素の画面上の位置は変わらない', () => {
    const v = view(40, 60, 0.9)
    const before = canvasBounds({ sections: [section], cards: [card] })
    // セクションを、負の座標(-500, -300)へ動かす
    const moved = { ...section, x: -500, y: -300 }
    const afterBounds = canvasBounds({ sections: [moved], cards: [card] })
    expect(afterBounds.offsetX).not.toBe(before.offsetX) // 範囲が変わって、ずらし量が変わる

    const prevOff = { x: before.offsetX, y: before.offsetY }
    const nextOff = { x: afterBounds.offsetX, y: afterBounds.offsetY }
    const fixed = compensateOffsetChange(v, prevOff, nextOff)

    // 動かしていないカード(300, 200)は、画面上の位置が変わらない
    const c = { x: card.x, y: card.y }
    const a = screenPositionOf(v, prevOff, c)
    const b = screenPositionOf(fixed, nextOff, c)
    expect(b.x).toBeCloseTo(a.x, 6)
    expect(b.y).toBeCloseTo(a.y, 6)

    // 補正をしないと、同じカードが、ずらし量の変化 × 倍率だけ動く(これが、画面が勝手に動く不具合)
    const uncorrected = screenPositionOf(v, nextOff, c)
    expect(uncorrected.x - a.x).toBeCloseTo((nextOff.x - prevOff.x) * v.scale, 6)
    expect(Math.abs(uncorrected.x - a.x)).toBeGreaterThan(100)
  })

  test('右下へ動かしても(最小座標が変わらない)ずらし量は変わらず、補正は 0', () => {
    const before = canvasBounds({ sections: [section], cards: [card] })
    const moved = { ...section, x: 900, y: 700 }
    const after = canvasBounds({ sections: [moved], cards: [card] })
    expect(after.offsetX).toBe(before.offsetX)
    expect(after.offsetY).toBe(before.offsetY)
    const v = view(5, 5, 1.2)
    expect(
      compensateOffsetChange(
        v,
        { x: before.offsetX, y: before.offsetY },
        { x: after.offsetX, y: after.offsetY },
      ),
    ).toBe(v)
  })
})
