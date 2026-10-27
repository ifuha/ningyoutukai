import { describe, expect, test } from 'bun:test'
import { boxWithin } from './use-card-boxes'

// DOM なしで、offsetParent をたどる計算だけを確かめる(擬似の要素)
const el = (
  offsetLeft: number,
  offsetTop: number,
  offsetWidth: number,
  offsetHeight: number,
  offsetParent: unknown,
) => ({ offsetLeft, offsetTop, offsetWidth, offsetHeight, offsetParent })

describe('boxWithin', () => {
  test('中身の直下にある要素は、その offset がそのまま位置になる(絶対配置のカード)', () => {
    const content = {}
    const card = el(100, 50, 240, 138, content)
    expect(boxWithin(content, card)).toEqual({ left: 100, top: 50, width: 240, height: 138 })
  })
  test('自動配置のカードは、間にある位置決めの要素(li、枠)の offset を足していく', () => {
    const content = {}
    const flow = el(10, 20, 700, 300, content) // 自動配置の枠(マージンでずらした位置)
    const li = el(250, 180, 264, 200, flow) // メンバーの li
    const card = el(12, 24, 240, 150, li) // li の中のカード(px-3 / pt-6)
    expect(boxWithin(content, card)).toEqual({
      left: 10 + 250 + 12,
      top: 20 + 180 + 24,
      width: 240,
      height: 150,
    })
  })
  test('幅と高さは、その要素自身の値(親の値を足さない)', () => {
    const content = {}
    const parent = el(0, 0, 999, 999, content)
    const card = el(5, 5, 240, 100, parent)
    const b = boxWithin(content, card)
    expect(b.width).toBe(240)
    expect(b.height).toBe(100)
  })
  test('content に着かないまま親が尽きても、落ちない(足せるところまでの値)', () => {
    const card = el(5, 6, 10, 20, null)
    expect(boxWithin({}, card)).toEqual({ left: 5, top: 6, width: 10, height: 20 })
  })
})
