import { describe, expect, test } from 'bun:test'
import { boxToCanvasRect, canvasToClient, clientToCanvas } from './canvas-view'

const zero = { x: 0, y: 0 }

describe('clientToCanvas(画面の座標 → キャンバス座標)', () => {
  test('倍率 1、パンなし、ずらしなし: 中身の左上からの距離がそのままキャンバス座標', () => {
    expect(clientToCanvas({ x: 150, y: 90 }, { x: 100, y: 50 }, 1, zero)).toEqual({ x: 50, y: 40 })
  })
  test('パンは、中身の左上の位置(contentOrigin)に含まれる。動かすと、同じ画面の点が別のキャンバス座標になる', () => {
    const before = clientToCanvas({ x: 400, y: 300 }, { x: 100, y: 100 }, 1, zero)
    const panned = clientToCanvas({ x: 400, y: 300 }, { x: 160, y: 70 }, 1, zero)
    expect(before).toEqual({ x: 300, y: 200 })
    expect(panned).toEqual({ x: 240, y: 230 })
  })
  test('ズーム: 倍率 2 のとき、画面上の 100px は、キャンバスの 50', () => {
    expect(clientToCanvas({ x: 300, y: 200 }, { x: 100, y: 100 }, 2, zero)).toEqual({ x: 100, y: 50 })
  })
  test('ズーム: 倍率 0.5 のとき、画面上の 100px は、キャンバスの 200', () => {
    expect(clientToCanvas({ x: 200, y: 150 }, { x: 100, y: 100 }, 0.5, zero)).toEqual({ x: 200, y: 100 })
  })
  test('負の座標のずらし(offset)を引く: 描画上の (100, 30) は、キャンバスの (0, 0)(offset が 100, 30 のとき)', () => {
    expect(clientToCanvas({ x: 100, y: 30 }, zero, 1, { x: 100, y: 30 })).toEqual({ x: 0, y: 0 })
    // 左上より左・上の点は、負のキャンバス座標
    expect(clientToCanvas({ x: 40, y: 10 }, zero, 1, { x: 100, y: 30 })).toEqual({ x: -60, y: -20 })
  })
  test('倍率と offset の組み合わせ(倍率は、offset より先にかかる順序)', () => {
    // 中身の左上が画面の (50, 80)。倍率 2。offset (10, 20)。画面の (250, 280) → 中身の (100, 100) → キャンバスの (90, 80)
    expect(clientToCanvas({ x: 250, y: 280 }, { x: 50, y: 80 }, 2, { x: 10, y: 20 })).toEqual({ x: 90, y: 80 })
  })
  test('倍率が 0 以下・NaN のときは、1 として扱う(0 で割らない)', () => {
    expect(clientToCanvas({ x: 60, y: 60 }, zero, 0, zero)).toEqual({ x: 60, y: 60 })
    expect(clientToCanvas({ x: 60, y: 60 }, zero, -2, zero)).toEqual({ x: 60, y: 60 })
    expect(clientToCanvas({ x: 60, y: 60 }, zero, Number.NaN, zero)).toEqual({ x: 60, y: 60 })
  })
})

describe('canvasToClient(逆の変換)', () => {
  test('clientToCanvas と往復すると元に戻る(倍率・パン・ずらしのいろいろな値)', () => {
    let seed = 7
    const rand = () => {
      seed = (seed * 1664525 + 1013904223) % 4294967296
      return seed / 4294967296
    }
    for (let i = 0; i < 200; i += 1) {
      const client = { x: rand() * 2000 - 500, y: rand() * 1200 - 300 }
      const origin = { x: rand() * 400 - 200, y: rand() * 400 - 200 }
      const scale = 0.1 + rand() * 4
      const offset = { x: rand() * 300, y: rand() * 300 }
      const back = canvasToClient(clientToCanvas(client, origin, scale, offset), origin, scale, offset)
      expect(back.x).toBeCloseTo(client.x, 6)
      expect(back.y).toBeCloseTo(client.y, 6)
    }
  })
})

describe('boxToCanvasRect(測った矩形 → キャンバス座標の矩形)', () => {
  test('位置は offset を戻し、大きさはそのまま', () => {
    expect(boxToCanvasRect({ left: 150, top: 80, width: 240, height: 130 }, { x: 100, y: 30 })).toEqual({
      x: 50,
      y: 50,
      width: 240,
      height: 130,
    })
  })
  test('offset がないとき(0)は、そのまま', () => {
    expect(boxToCanvasRect({ left: 10, top: 20, width: 240, height: 118 }, zero)).toEqual({
      x: 10,
      y: 20,
      width: 240,
      height: 118,
    })
  })
})
