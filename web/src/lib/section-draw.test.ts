import { describe, expect, test } from 'bun:test'
import {
  DRAW_IDLE,
  drawReducer,
  formatSize,
  previewRect,
  type DrawEffect,
  type DrawEvent,
  type DrawState,
} from './section-draw'

// 「ドラッグでセクションを置く」の状態遷移のテスト(DOM なし)

const down = (x: number, y: number, over: Partial<Extract<DrawEvent, { type: 'down' }>> = {}): DrawEvent => ({
  type: 'down',
  pointerId: 1,
  button: 0,
  isPrimary: true,
  point: { x, y },
  ...over,
})
const move = (x: number, y: number, pointerId = 1): DrawEvent => ({ type: 'move', pointerId, point: { x, y } })
const up = (x: number, y: number, over: Partial<Extract<DrawEvent, { type: 'up' }>> = {}): DrawEvent => ({
  type: 'up',
  pointerId: 1,
  button: 0,
  point: { x, y },
  ...over,
})

// 事象を順に流し、出てきた副作用をすべて集める(呼ぶ側と同じ使い方)
function run(events: DrawEvent[], from: DrawState = DRAW_IDLE) {
  let state = from
  const effects: DrawEffect[] = []
  for (const e of events) {
    const step = drawReducer(state, e)
    state = step.state
    if (step.effect) effects.push(step.effect)
  }
  return { state, effects }
}

describe('drawReducer: 通常のドラッグ', () => {
  test('押す → 動かす → 離す で、四角が 1 回だけ確定する', () => {
    const { state, effects } = run([down(100, 100), move(250, 300), move(400, 500), up(400, 500)])
    expect(effects).toEqual([{ type: 'create', rect: { x: 100, y: 100, width: 300, height: 400 } }])
    expect(state).toEqual(DRAW_IDLE)
  })

  test('押しただけでは、ドラッグ中になり、副作用は出ない', () => {
    const step = drawReducer(DRAW_IDLE, down(10, 20))
    expect(step.state).toEqual({ kind: 'dragging', pointerId: 1, start: { x: 10, y: 20 }, current: { x: 10, y: 20 } })
    expect(step.effect).toBeNull()
    expect(step.consumed).toBe(true)
  })

  test('動かすと、現在の位置だけが変わり、始点は変わらない', () => {
    const { state } = run([down(10, 20), move(300, 400)])
    expect(state).toEqual({ kind: 'dragging', pointerId: 1, start: { x: 10, y: 20 }, current: { x: 300, y: 400 } })
  })

  test('4 方向のどれにドラッグしても、正の幅・高さの四角になる(始点の角は動かない)', () => {
    const cases: Array<[string, [number, number], [number, number], { x: number; y: number; width: number; height: number }]> = [
      ['右下', [100, 100], [300, 400], { x: 100, y: 100, width: 200, height: 300 }],
      ['右上', [100, 400], [300, 100], { x: 100, y: 100, width: 200, height: 300 }],
      ['左下', [300, 100], [100, 400], { x: 100, y: 100, width: 200, height: 300 }],
      ['左上', [300, 400], [100, 100], { x: 100, y: 100, width: 200, height: 300 }],
    ]
    for (const [name, from, to, rect] of cases) {
      const { effects } = run([down(from[0], from[1]), move(to[0], to[1]), up(to[0], to[1])])
      expect({ name, effects }).toEqual({ name, effects: [{ type: 'create', rect }] })
    }
  })

  test('ほぼクリックだけ(動かさずに離す)は、始点を左上にした既定の 300×400', () => {
    const { effects } = run([down(500, 600), up(500, 600)])
    expect(effects).toEqual([{ type: 'create', rect: { x: 500, y: 600, width: 300, height: 400 } }])
  })

  test('数ピクセルだけ動いた(最小に満たない)ときも、既定の大きさ', () => {
    const { effects } = run([down(10, 10), move(14, 13), up(14, 13)])
    expect(effects).toEqual([{ type: 'create', rect: { x: 10, y: 10, width: 300, height: 400 } }])
  })

  test('負の座標でも、そのまま四角になる', () => {
    const { effects } = run([down(-500, -400), up(-200, -100)])
    expect(effects).toEqual([{ type: 'create', rect: { x: -500, y: -400, width: 300, height: 300 } }])
  })

  test('確定の座標は、離したときの位置で決まる(最後の move ではなく up の位置)', () => {
    const { effects } = run([down(0, 0), move(100, 100), up(500, 500)])
    expect(effects).toEqual([{ type: 'create', rect: { x: 0, y: 0, width: 500, height: 500 } }])
  })
})

describe('drawReducer: onCreate は 1 回だけ', () => {
  test('離したあとに、もう一度 up が来ても、確定しない', () => {
    const { state, effects } = run([down(0, 0), up(300, 400), up(300, 400), up(300, 400)])
    expect(effects.filter((e) => e.type === 'create')).toHaveLength(1)
    expect(state).toEqual(DRAW_IDLE)
  })

  test('離したあとの move・lostpointercapture(cancel)は、何も出さない', () => {
    const { effects } = run([down(0, 0), up(300, 400), move(1, 1), { type: 'cancel', pointerId: 1 }])
    expect(effects).toEqual([{ type: 'create', rect: { x: 0, y: 0, width: 300, height: 400 } }])
  })

  test('確定のあと、新しくドラッグを始めれば、また 1 回確定する(連続して置ける)', () => {
    const { effects } = run([down(0, 0), up(300, 400), down(1000, 1000), up(1300, 1400)])
    expect(effects.map((e) => e.type)).toEqual(['create', 'create'])
  })

  test('待機のまま up だけが来ても、確定しない', () => {
    const step = drawReducer(DRAW_IDLE, up(10, 10))
    expect(step.effect).toBeNull()
    expect(step.consumed).toBe(false)
  })
})

describe('drawReducer: 取り消し', () => {
  test('ドラッグ中の Esc は、プレビューを消して cancel(確定しない)', () => {
    const { state, effects } = run([down(0, 0), move(200, 200), { type: 'escape' }, up(200, 200)])
    expect(effects).toEqual([{ type: 'cancel' }])
    expect(state).toEqual(DRAW_IDLE)
  })

  test('ドラッグ中でなくても、Esc は cancel を返す(道具から抜ける)', () => {
    const step = drawReducer(DRAW_IDLE, { type: 'escape' })
    expect(step.effect).toEqual({ type: 'cancel' })
    expect(step.state).toEqual(DRAW_IDLE)
  })

  test('pointercancel(同じポインタ)は、cancel を返して待機に戻る', () => {
    const { state, effects } = run([down(0, 0), move(200, 200), { type: 'cancel', pointerId: 1 }])
    expect(effects).toEqual([{ type: 'cancel' }])
    expect(state).toEqual(DRAW_IDLE)
  })

  test('キャプチャが失われたあとの up では、確定しない', () => {
    const { effects } = run([down(0, 0), { type: 'cancel', pointerId: 1 }, up(300, 400)])
    expect(effects).toEqual([{ type: 'cancel' }])
  })

  test('別のポインタの pointercancel は無視する', () => {
    const { state, effects } = run([down(0, 0), { type: 'cancel', pointerId: 2 }])
    expect(effects).toEqual([])
    expect(state.kind).toBe('dragging')
  })

  test('reset(道具が外から切られた)は、何も呼ばずに待機へ戻る', () => {
    const { state, effects } = run([down(0, 0), move(50, 50), { type: 'reset' }])
    expect(effects).toEqual([])
    expect(state).toEqual(DRAW_IDLE)
  })
})

describe('drawReducer: 無視する入力', () => {
  test('右クリック(button=2)の押下では、始めない。親へ任せる(consumed=false)', () => {
    const step = drawReducer(DRAW_IDLE, down(10, 10, { button: 2 }))
    expect(step.state).toEqual(DRAW_IDLE)
    expect(step.consumed).toBe(false)
  })

  test('中ボタン(button=1)の押下でも、始めない', () => {
    expect(drawReducer(DRAW_IDLE, down(10, 10, { button: 1 })).state).toEqual(DRAW_IDLE)
  })

  test('マルチタッチの 2 本目(isPrimary=false)では、始めない', () => {
    const step = drawReducer(DRAW_IDLE, down(10, 10, { pointerId: 2, isPrimary: false }))
    expect(step.state).toEqual(DRAW_IDLE)
    expect(step.consumed).toBe(false)
  })

  test('ドラッグ中に 2 本目の指が触れても、ドラッグは変わらず、確定も取り消しもしない', () => {
    const { state, effects } = run([
      down(100, 100),
      move(150, 150),
      down(900, 900, { pointerId: 2, isPrimary: false }),
      move(999, 999, 2),
      up(999, 999, { pointerId: 2 }),
    ])
    expect(effects).toEqual([])
    expect(state).toEqual({ kind: 'dragging', pointerId: 1, start: { x: 100, y: 100 }, current: { x: 150, y: 150 } })
  })

  test('ドラッグ中の 2 回目の押下(同じポインタの別ボタン)は、始点を上書きしない', () => {
    const { state } = run([down(100, 100), move(150, 150), down(800, 800, { button: 2 })])
    expect(state).toEqual({ kind: 'dragging', pointerId: 1, start: { x: 100, y: 100 }, current: { x: 150, y: 150 } })
  })

  test('ドラッグ中に、別のボタンを離しても、確定しない', () => {
    const { state, effects } = run([down(0, 0), move(200, 200), up(200, 200, { button: 2 })])
    expect(effects).toEqual([])
    expect(state.kind).toBe('dragging')
  })

  test('待機のときの move は、何もしない', () => {
    const step = drawReducer(DRAW_IDLE, move(10, 10))
    expect(step.state).toEqual(DRAW_IDLE)
    expect(step.consumed).toBe(false)
  })
})

describe('previewRect / formatSize', () => {
  test('待機のときは null', () => {
    expect(previewRect(DRAW_IDLE)).toBeNull()
  })

  test('ドラッグ中は、いま離した場合に置かれる四角と同じ(押した直後は、既定の大きさ)', () => {
    const { state } = run([down(100, 100)])
    expect(previewRect(state)).toEqual({ x: 100, y: 100, width: 300, height: 400 })
    const dragged = run([down(100, 100), move(500, 400)]).state
    expect(previewRect(dragged)).toEqual({ x: 100, y: 100, width: 400, height: 300 })
  })

  test('プレビューは、離したときの確定の四角と、常に一致する', () => {
    const events = [down(7, 9), move(200, 500)]
    const preview = previewRect(run(events).state)
    const { effects } = run([...events, up(200, 500)])
    expect(effects).toEqual([{ type: 'create', rect: preview! }])
  })

  test('大きさの文字は、整数に丸めて「幅×高さ」', () => {
    expect(formatSize({ width: 300, height: 400 })).toBe('300×400')
    expect(formatSize({ width: 123.4, height: 99.6 })).toBe('123×100')
  })
})
