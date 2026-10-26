import { describe, expect, test } from 'bun:test'
import { startDragSession, type DragCancelReason, type DragSessionOptions } from '#/lib/drag-session'
import { FakeScheduler, FakeTarget, fakeBody, pointerEvent as ev } from '#/lib/drag-test-support'

function setup(overrides: Partial<DragSessionOptions> = {}) {
  const target = new FakeTarget()
  const scheduler = new FakeScheduler()
  const calls = {
    moves: [] as Array<[number, number]>,
    ups: [] as Array<[number, number]>,
    cancels: [] as DragCancelReason[],
    frames: 0,
    others: 0,
  }
  const body = fakeBody()
  const session = startDragSession({
    target,
    pointerId: 1,
    scheduler,
    lock: { body, cursor: 'grabbing' },
    onMove: (e) => {
      calls.moves.push([e.clientX, e.clientY])
      return true
    },
    onUp: (e) => calls.ups.push([e.clientX, e.clientY]),
    onCancel: (r) => calls.cancels.push(r),
    onFrame: () => calls.frames++,
    onOtherPointerDown: () => {
      calls.others++
      return true
    },
    ...overrides,
  })
  return { target, scheduler, calls, session, body }
}

describe('startDragSession: window(受け手)だけで、ドラッグが進む', () => {
  test('要素ではなく、受け手に飛ばした pointermove だけで、動きが届く(速く動かして、押した要素の外へ出ても追従する)', () => {
    const { target, calls } = setup()
    // 押した要素を持たない(受け手へ直接)。要素の外・画面の外のような、遠い座標でも届く
    target.dispatch('pointermove', ev(1, 5000, -3000))
    target.dispatch('pointermove', ev(1, -40, 9999))
    expect(calls.moves).toEqual([
      [5000, -3000],
      [-40, 9999],
    ])
  })

  test('最初の 1 回の大きな動きでも、そのまま届く(しきい値の前でも、取りこぼさない)', () => {
    const { target, calls } = setup()
    target.dispatch('pointermove', ev(1, 700, 400))
    expect(calls.moves).toEqual([[700, 400]])
  })

  test('onMove が true なら、その動きを止める(パンに渡さない)。false なら、止めない', () => {
    let stop = true
    const { target } = setup({ onMove: () => stop })
    const a = ev(1, 10, 10)
    target.dispatch('pointermove', a)
    expect(a.stopped).toBe(true)
    expect(a.prevented).toBe(true)
    stop = false
    const b = ev(1, 20, 20)
    target.dispatch('pointermove', b)
    expect(b.stopped).toBe(false)
  })

  test('ほかのポインタの動き・離し・取り消しは、この操作に使わない', () => {
    const { target, calls, session } = setup()
    target.dispatch('pointermove', ev(2, 10, 10))
    target.dispatch('pointerup', ev(2, 10, 10))
    target.dispatch('pointercancel', ev(2, 10, 10))
    expect(calls.moves).toEqual([])
    expect(calls.ups).toEqual([])
    expect(calls.cancels).toEqual([])
    expect(session.active).toBe(true)
  })

  test('離したとき、座標は pointerup のもの(最後の pointermove ではない)。終わったら、リスナーが全部外れる', () => {
    const { target, calls, session } = setup()
    target.dispatch('pointermove', ev(1, 100, 100))
    target.dispatch('pointerup', ev(1, 180, 95))
    expect(calls.ups).toEqual([[180, 95]])
    expect(session.active).toBe(false)
    expect(target.count).toBe(0)
    // 終わったあとの動き・離しは、何も呼ばない
    target.dispatch('pointermove', ev(1, 1, 1))
    target.dispatch('pointerup', ev(1, 2, 2))
    expect(calls.moves).toEqual([[100, 100]])
    expect(calls.ups).toEqual([[180, 95]])
  })

  test('離しは、止めない(パンが、ポインタの記録を片付けられるように)', () => {
    const { target } = setup()
    const up = ev(1, 1, 1)
    target.dispatch('pointerup', up)
    expect(up.stopped).toBe(false)
  })
})

describe('startDragSession: 取り消しと後始末', () => {
  test('pointercancel で取り消し(リスナーを外してから、onCancel)', () => {
    const { target, calls, session } = setup()
    target.dispatch('pointercancel', ev(1, 0, 0))
    expect(calls.cancels).toEqual(['pointercancel'])
    expect(calls.ups).toEqual([])
    expect(session.active).toBe(false)
    expect(target.count).toBe(0)
  })

  test('Esc で取り消し。Esc 以外のキーは無視', () => {
    const { target, calls, session } = setup()
    target.dispatch('keydown', { key: 'a' })
    expect(session.active).toBe(true)
    target.dispatch('keydown', { key: 'Escape' })
    expect(calls.cancels).toEqual(['escape'])
    expect(target.count).toBe(0)
  })

  test('window が非アクティブ(blur)になったら、取り消し', () => {
    const { target, calls } = setup()
    target.dispatch('blur', {})
    expect(calls.cancels).toEqual(['blur'])
    expect(target.count).toBe(0)
  })

  test('end() は、何も呼ばずに終わる。何度呼んでも安全。リスナー・予約したフレームが残らない', () => {
    const { target, calls, session, scheduler } = setup()
    session.requestFrame()
    session.end()
    session.end()
    expect(target.count).toBe(0)
    expect(scheduler.pending.size).toBe(0)
    expect(calls.cancels).toEqual([])
    expect(calls.ups).toEqual([])
  })

  test('続けて何回始めても(前のを終えてから)、リスナーが溜まらない', () => {
    const target = new FakeTarget()
    for (let i = 0; i < 5; i++) {
      const s = startDragSession({
        target,
        pointerId: 1,
        onMove: () => false,
        onUp: () => {},
        onCancel: () => {},
      })
      target.dispatch('pointerup', ev(1, 0, 0))
      expect(s.active).toBe(false)
    }
    expect(target.count).toBe(0)
  })

  test('onUp の中で、新しい操作を始めても、前のリスナーとぶつからない', () => {
    const target = new FakeTarget()
    let second = 0
    startDragSession({
      target,
      pointerId: 1,
      onMove: () => false,
      onUp: () => {
        startDragSession({
          target,
          pointerId: 1,
          onMove: () => {
            second++
          },
          onUp: () => {},
          onCancel: () => {},
        })
      },
      onCancel: () => {},
    })
    target.dispatch('pointerup', ev(1, 0, 0))
    target.dispatch('pointermove', ev(1, 5, 5))
    expect(second).toBe(1)
  })
})

describe('startDragSession: フレームのまとめ', () => {
  test('requestFrame を何回呼んでも、1 フレームに 1 回だけ onFrame', () => {
    const { calls, session, scheduler } = setup()
    for (let i = 0; i < 20; i++) session.requestFrame()
    expect(scheduler.pending.size).toBe(1)
    scheduler.flush()
    expect(calls.frames).toBe(1)
    // 次のフレームでも、また 1 回
    session.requestFrame()
    session.requestFrame()
    scheduler.flush()
    expect(calls.frames).toBe(2)
  })

  test('離したら、予約したフレームは取り消される(離したあとに、見た目を書かない)', () => {
    const { target, calls, scheduler, session } = setup()
    session.requestFrame()
    target.dispatch('pointerup', ev(1, 1, 1))
    scheduler.flush()
    expect(calls.frames).toBe(0)
  })

  test('終わったあとの requestFrame は、何もしない', () => {
    const { session, scheduler } = setup()
    session.end()
    session.requestFrame()
    expect(scheduler.pending.size).toBe(0)
  })
})

describe('startDragSession: テキストの選択とカーソルの固定', () => {
  test('始めただけ(クリックかもしれない間)は固定しない。確定(engage)で固定する', () => {
    const { session, body } = setup()
    expect(body.style.userSelect).toBe('auto')
    expect(body.style.cursor).toBe('default')
    session.engage()
    session.engage()
    expect(body.style.userSelect).toBe('none')
    expect(body.style.cursor).toBe('grabbing')
    session.end()
    // 2 回 engage しても、元の値は「固定前」のものに戻る(固定後の値を、元として覚えない)
    expect(body.style.userSelect).toBe('auto')
    expect(body.style.cursor).toBe('default')
  })

  test('固定していないときに終わっても、何も変えない', () => {
    const { target, body } = setup()
    target.dispatch('pointerup', ev(1, 0, 0))
    expect(body.style.userSelect).toBe('auto')
    expect(body.style.cursor).toBe('default')
  })

  test('確定のあと、離す・取り消す・end() のどれで終わっても、元に戻す', () => {
    for (const finishWith of ['up', 'cancel', 'escape', 'end'] as const) {
      const { target, session, body } = setup()
      session.engage()
      expect(body.style.userSelect).toBe('none')
      expect(body.style.cursor).toBe('grabbing')
      if (finishWith === 'up') target.dispatch('pointerup', ev(1, 0, 0))
      else if (finishWith === 'cancel') target.dispatch('pointercancel', ev(1, 0, 0))
      else if (finishWith === 'escape') target.dispatch('keydown', { key: 'Escape' })
      else session.end()
      expect(body.style.userSelect).toBe('auto')
      expect(body.style.cursor).toBe('default')
    }
  })
})

describe('startDragSession: 別のポインタの押し(2 本目の指)', () => {
  test('onOtherPointerDown に知らせ、true なら止める。同じポインタの押しは知らせない', () => {
    const { target, calls } = setup()
    const second = ev(2, 0, 0)
    target.dispatch('pointerdown', second)
    expect(calls.others).toBe(1)
    expect(second.stopped).toBe(true)
    target.dispatch('pointerdown', ev(1, 0, 0))
    expect(calls.others).toBe(1)
  })

  test('呼び出し側が、取り消す(ピンチに譲る)こともできる(end を呼ぶ)', () => {
    const target = new FakeTarget()
    let session!: ReturnType<typeof startDragSession>
    session = startDragSession({
      target,
      pointerId: 1,
      onMove: () => false,
      onUp: () => {},
      onCancel: () => {},
      onOtherPointerDown: () => {
        session.end()
      },
    })
    target.dispatch('pointerdown', ev(2, 0, 0))
    expect(session.active).toBe(false)
    expect(target.count).toBe(0)
  })
})
