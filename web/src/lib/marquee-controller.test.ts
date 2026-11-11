import { describe, expect, test } from 'bun:test'
import { createMarqueeController, MARQUEE_THRESHOLD } from './marquee-controller'
import type { DragSessionOptions } from './drag-session'
import type { Rect } from './section-edit-geometry'

// 押した瞬間から離すまでの仕組み(drag-session)を、偽のものに差し替えて、範囲選択の状態だけを確かめる
type Entry = { options: DragSessionOptions; ended: boolean }
const setup = (overrides: Partial<Parameters<typeof createMarqueeController>[0]> = {}) => {
  const entries: Entry[] = []
  const active: boolean[] = []
  const live: Array<{ rect: Rect; additive: boolean }> = []
  const commits: Array<{ rect: Rect; additive: boolean }> = []
  let cancels = 0
  let suppressed = 0

  const startSession = (options: DragSessionOptions) => {
    const entry: Entry = { options, ended: false }
    entries.push(entry)
    return {
      get active() {
        return !entry.ended
      },
      engage() {},
      requestFrame() {
        options.onFrame?.()
      },
      end() {
        entry.ended = true
      },
    }
  }

  const controller = createMarqueeController({
    getTarget: () => ({ addEventListener() {}, removeEventListener() {} }),
    // 画面の座標を 1/2 にして、キャンバス座標にする(変換が効いていることを確かめる)
    toCanvas: (p) => ({ x: p.x / 2, y: p.y / 2 }),
    onLive: (rect, additive) => live.push({ rect, additive }),
    onCommit: (rect, additive) => commits.push({ rect, additive }),
    onCancel: () => {
      cancels++
    },
    onActive: (on) => active.push(on),
    suppressClick: () => {
      suppressed++
    },
    startSession,
    ...overrides,
  })

  const pointer = (pointerId: number, clientX: number, clientY: number) => ({
    pointerId,
    clientX,
    clientY,
    stopPropagation() {},
    preventDefault() {},
  })
  const move = (entry: Entry, x: number, y: number) =>
    entry.options.onMove(pointer(1, x, y))
  const up = (entry: Entry, x: number, y: number) => entry.options.onUp(pointer(1, x, y))

  return {
    controller,
    entries,
    active,
    live,
    commits,
    cancels: () => cancels,
    suppressed: () => suppressed,
    move,
    up,
    pointer,
  }
}

describe('範囲選択(押してから離すまで)', () => {
  test('押しただけ(しきい値未満)は、範囲選択を始めない。離しても、確定も click の抑止もしない', () => {
    const t = setup()
    t.controller.start({ pointerId: 1, clientX: 100, clientY: 100, additive: false })
    expect(t.active).toEqual([])

    const entry = t.entries[0]
    expect(t.move(entry, 100 + MARQUEE_THRESHOLD - 1, 100)).toBe(true)
    expect(t.active).toEqual([])
    expect(t.live).toEqual([])

    t.up(entry, 102, 102)
    expect(t.commits).toEqual([])
    expect(t.suppressed()).toBe(0)
    expect(t.controller.isActive()).toBe(false)
  })

  test('しきい値ちょうどで、範囲選択が始まる。四角はキャンバス座標。離した位置で確定し、click を捨てる', () => {
    const t = setup()
    t.controller.start({ pointerId: 1, clientX: 100, clientY: 100, additive: true })
    const entry = t.entries[0]

    t.move(entry, 100 + MARQUEE_THRESHOLD, 100)
    expect(t.active).toEqual([true])
    expect(t.live).toEqual([{ rect: { x: 50, y: 50, width: 2, height: 0 }, additive: true }])

    t.move(entry, 130, 140)
    expect(t.live.at(-1)?.rect).toEqual({ x: 50, y: 50, width: 15, height: 20 })

    t.up(entry, 120, 160)
    expect(t.commits).toEqual([{ rect: { x: 50, y: 50, width: 10, height: 30 }, additive: true }])
    expect(t.suppressed()).toBe(1)
    expect(t.active).toEqual([true, false])
    expect(t.controller.isActive()).toBe(false)
  })

  test('動きは、1 フレームに 1 回だけ知らせる(フレームは、離す前に必ず届く)', () => {
    const t = setup()
    t.controller.start({ pointerId: 1, clientX: 0, clientY: 0, additive: false })
    const entry = t.entries[0]
    t.move(entry, 10, 10)
    t.move(entry, 20, 20)
    t.move(entry, 30, 30)
    // 偽の requestFrame はすぐに onFrame を呼ぶので、動きごとに 1 回になる(実際は、次のフレームにまとまる)
    expect(t.live.map((l) => l.rect.width)).toEqual([5, 10, 15])
  })

  test('上・左へドラッグしても、正の幅・高さの四角になる', () => {
    const t = setup()
    t.controller.start({ pointerId: 1, clientX: 100, clientY: 100, additive: false })
    const entry = t.entries[0]
    t.move(entry, 80, 70)
    t.up(entry, 60, 50)
    expect(t.commits[0].rect).toEqual({ x: 30, y: 25, width: 20, height: 25 })
  })
})

describe('取りやめ(Esc・pointercancel・window が非アクティブ)', () => {
  test('ドラッグ中の Esc は、確定せずに取りやめ、ポインタが離れるまで動きを呑み込む。離したら click を捨てる', () => {
    const t = setup()
    t.controller.start({ pointerId: 1, clientX: 100, clientY: 100, additive: false })
    const entry = t.entries[0]
    t.move(entry, 120, 120)
    expect(t.active).toEqual([true])

    entry.options.onCancel('escape')
    expect(t.cancels()).toBe(1)
    expect(t.active).toEqual([true, false])
    expect(t.entries.length).toBe(2) // 離すまで呑み込む、2 つ目の操作
    expect(t.controller.isActive()).toBe(true)

    const swallow = t.entries[1]
    expect(t.move(swallow, 200, 200)).toBe(true)
    expect(t.live.length).toBe(1) // 呑み込んでいる間は、範囲選択を更新しない

    t.up(swallow, 200, 200)
    expect(t.commits).toEqual([])
    expect(t.suppressed()).toBe(1)
    expect(t.controller.isActive()).toBe(false)
  })

  test('押しただけ(Esc がしきい値の前)は、取りやめを伝えず、呑み込みもしない', () => {
    const t = setup()
    t.controller.start({ pointerId: 1, clientX: 100, clientY: 100, additive: false })
    t.entries[0].options.onCancel('escape')
    expect(t.cancels()).toBe(0)
    expect(t.entries.length).toBe(1)
    expect(t.controller.isActive()).toBe(false)
  })

  test('pointercancel・window が非アクティブは、取りやめるが、click は捨てない', () => {
    for (const reason of ['pointercancel', 'blur'] as const) {
      const t = setup()
      t.controller.start({ pointerId: 1, clientX: 100, clientY: 100, additive: false })
      const entry = t.entries[0]
      t.move(entry, 120, 120)
      entry.options.onCancel(reason)
      expect(t.cancels()).toBe(1)
      expect(t.suppressed()).toBe(0)
      expect(t.controller.isActive()).toBe(false)
    }
  })
})

describe('cancel()(外から取りやめる)', () => {
  test('始まっていれば取りやめ、確定しない', () => {
    const t = setup()
    t.controller.start({ pointerId: 1, clientX: 100, clientY: 100, additive: false })
    t.move(t.entries[0], 120, 120)
    t.controller.cancel()
    expect(t.cancels()).toBe(1)
    expect(t.active).toEqual([true, false])
    expect(t.commits).toEqual([])
    expect(t.controller.isActive()).toBe(false)
  })
  test('始まっていなければ、何もしない', () => {
    const t = setup()
    t.controller.cancel()
    expect(t.cancels()).toBe(0)
    expect(t.active).toEqual([])
  })
})
