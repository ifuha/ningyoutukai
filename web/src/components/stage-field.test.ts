import { describe, expect, test } from 'bun:test'
import { dotSize, edgeFade } from './dot-field'
import { FLOOR_TOP, LIP_Z, STRING_BOTTOM, STRING_X, curtainEdge, stageSize, valanceBottom } from './stage-field'

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

  test('下には、手前の縁の帯(濃い)と、板の継ぎ目のある床がある', () => {
    // 画面の下の端(手前)に、フットライトの帯
    const lipY = FLOOR_TOP + (1 - FLOOR_TOP) * (LIP_Z + 0.03)
    expect(stageSize(0.5, lipY, 0)).toBeGreaterThanOrEqual(0.5)
    let floor = 0
    for (let i = 0; i <= 40; i++) floor = Math.max(floor, stageSize(i / 40, 0.92, 0))
    expect(floor).toBeGreaterThan(0.08)
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
