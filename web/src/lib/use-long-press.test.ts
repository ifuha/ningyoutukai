import { describe, expect, test } from 'bun:test'
import { LONG_PRESS_MOVE_PX, LONG_PRESS_MS, movedTooFar, startsLongPress } from './use-long-press'

describe('長押しの計算', () => {
  test('時間は 500ms、取り消す距離は 8px', () => {
    expect(LONG_PRESS_MS).toBe(500)
    expect(LONG_PRESS_MOVE_PX).toBe(8)
  })

  test('始まるのは、タッチの主ボタンだけ(マウス・ペン・右ボタンは対象外)', () => {
    expect(startsLongPress({ pointerType: 'touch', button: 0 })).toBe(true)
    expect(startsLongPress({ pointerType: 'mouse', button: 0 })).toBe(false)
    expect(startsLongPress({ pointerType: 'pen', button: 0 })).toBe(false)
    expect(startsLongPress({ pointerType: 'touch', button: 2 })).toBe(false)
  })

  test('8px 動いたら取り消す(7px までは取り消さない)', () => {
    const from = { x: 100, y: 100 }
    expect(movedTooFar(from, { clientX: 107, clientY: 100 })).toBe(false)
    expect(movedTooFar(from, { clientX: 108, clientY: 100 })).toBe(true)
    expect(movedTooFar(from, { clientX: 106, clientY: 106 })).toBe(true)
    expect(movedTooFar(from, { clientX: 100, clientY: 100 })).toBe(false)
  })
})
