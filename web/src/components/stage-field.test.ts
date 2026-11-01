import { describe, expect, test } from 'bun:test'
import { dotSize, edgeFade } from './dot-field'
import {
  OPEN_DELAY_SEC,
  OPEN_SEC,
  STRING_BOTTOM,
  STRING_X,
  curtainEdge,
  openProgress,
  stageSize,
  valanceBottom,
} from './stage-field'

describe('stageSize', () => {
  test('どこでも 0〜1 に収まる(時刻が変わっても)', () => {
    for (const t of [0, 3.3, 120]) {
      for (let i = 0; i <= 60; i++) {
        for (let j = 0; j <= 60; j++) {
          const v = stageSize(i / 60, j / 60, t)
          expect(v).toBeGreaterThanOrEqual(0)
          expect(v).toBeLessThanOrEqual(1)
        }
      }
    }
  })

  test('同じ入力には、同じ値(決まった絵)', () => {
    expect(stageSize(0.1, 0.4, 5)).toBe(stageSize(0.1, 0.4, 5))
  })

  test('左右の幕は、対称(中央から、同じ距離の点は、同じ濃さ)', () => {
    for (const ny of [0.2, 0.4, 0.6]) {
      for (const nx of [0.02, 0.07, 0.12]) {
        expect(stageSize(nx, ny, 1)).toBeCloseTo(stageSize(1 - nx, ny, 1), 10)
      }
    }
  })

  test('端には幕がある(濃い)。幕の間の舞台の奥は、何も描かない', () => {
    expect(stageSize(0.03, 0.4, 0)).toBeGreaterThan(0.1)
    expect(stageSize(0.5, 0.4, 0)).toBe(0)
    expect(stageSize(0.35, 0.5, 0)).toBe(0)
  })

  test('幕の内側の縁は、上が広く、下へ向かって絞る', () => {
    expect(curtainEdge(0.1, 0)).toBeGreaterThan(curtainEdge(0.7, 0))
  })

  test('上には、波形の縁の飾り幕がある(全幅)。波の谷と山で、縁の高さが違う', () => {
    expect(stageSize(0.5, 0.01, 0)).toBeGreaterThan(0.2)
    expect(valanceBottom(0.05)).not.toBeCloseTo(valanceBottom(0.1), 3)
    // 縁より下は、飾り幕ではない
    expect(stageSize(0.35, valanceBottom(0.35) + 0.04, 0)).toBe(0)
  })

  test('床は描かない(幕だけ)。下でも、幕の間は何も描かず、端の幕だけがある', () => {
    for (const ny of [0.82, 0.9, 0.99]) {
      expect(stageSize(0.5, ny, 0)).toBe(0)
      expect(stageSize(0.3, ny, 0)).toBe(0)
      expect(stageSize(0.03, ny, 0)).toBeGreaterThan(0.1)
    }
  })

  test('中央の上に、糸が 3 本あり、ロゴの手前(糸の下の端)で止まる', () => {
    for (const x of STRING_X) {
      expect(stageSize(x, 0.09, 0)).toBeGreaterThan(0.3)
    }
    // 糸の下には、何もない
    expect(stageSize(STRING_X[1], STRING_BOTTOM + 0.02, 0)).toBe(0)
  })
})

describe('DotField の既定は、山のまま', () => {
  test('既定の絵(dotSize)と端の薄れ方(edgeFade)は、これまでどおり', () => {
    expect(dotSize(0.2, 0.98, 0)).toBeGreaterThan(dotSize(0.2, 0.5, 0))
    expect(edgeFade(0.5)).toBe(1)
    expect(edgeFade(0)).toBe(0)
  })
})

describe('幕が開く(openProgress)', () => {
  test('最初は閉じていて、少し待ってから動き出し、開ききって止まる', () => {
    expect(openProgress(0)).toBe(0)
    expect(openProgress(OPEN_DELAY_SEC)).toBe(0)
    expect(openProgress(OPEN_DELAY_SEC + OPEN_SEC)).toBe(1)
    expect(openProgress(100)).toBe(1)
    // 時間が負でも(時計のずれ)、閉じたまま
    expect(openProgress(-5)).toBe(0)
  })

  test('時間とともに、増える一方(戻らない)。0〜1 に収まる', () => {
    let last = -1
    for (let i = 0; i <= 40; i++) {
      const v = openProgress((i / 40) * (OPEN_DELAY_SEC + OPEN_SEC + 0.5))
      expect(v).toBeGreaterThanOrEqual(last)
      expect(v).toBeGreaterThanOrEqual(0)
      expect(v).toBeLessThanOrEqual(1)
      last = v
    }
  })

  test('出だしは遅く、終わりは緩やか(中ほどで、いちばん速い)', () => {
    const step = (a: number) => openProgress(OPEN_DELAY_SEC + a + 0.1) - openProgress(OPEN_DELAY_SEC + a)
    // 出だしが、いちばん速い(easeOut)。終わり際は、ほとんど動かない
    expect(step(0)).toBeGreaterThan(step(OPEN_SEC - 0.1))
  })

  test('閉じているとき、幕は中央で合わさる(中央も幕で埋まる)。開ききると、中央は何もない', () => {
    for (const ny of [0.2, 0.5, 0.9]) {
      expect(stageSize(0.5, ny, 0, 0)).toBeGreaterThan(0.05)
      expect(stageSize(0.4, ny, 0, 0)).toBeGreaterThan(0.05)
      expect(stageSize(0.5, ny, 0, 1)).toBe(0)
    }
  })

  test('開く途中は、幕の縁が、中央から端へ動く(中ほどでは、中央は空き、縁の近くはまだ幕)', () => {
    const half = openProgress(OPEN_DELAY_SEC + OPEN_SEC * 0.5)
    expect(half).toBeGreaterThan(0.5)
    expect(half).toBeLessThan(1)
    // 既定(開ききった)と、途中では、幕の範囲が違う(途中のほうが広い)
    let widerCount = 0
    for (let i = 0; i < 50; i++) {
      const nx = 0.2 + (i / 50) * 0.3
      if (stageSize(nx, 0.5, 0, half) > 0 && stageSize(nx, 0.5, 0, 1) === 0) widerCount++
    }
    expect(widerCount).toBeGreaterThan(0)
  })

  test('open を省くと、開ききった絵(これまでどおり)', () => {
    expect(stageSize(0.03, 0.4, 2)).toBe(stageSize(0.03, 0.4, 2, 1))
    expect(stageSize(0.5, 0.4, 2)).toBe(0)
  })
})
