import { describe, expect, test } from 'bun:test'
import type { FollowElement } from '#/lib/drag-follow'
import { FakeScheduler, FakeTarget, fakeBody, pointerEvent } from '#/lib/drag-test-support'
import type { Point } from '#/lib/section-edit-geometry'
import {
  createSelectionDragController,
  type SelectionDragPointerDown,
} from '#/lib/selection-drag-controller'

// 選択したものを、まとめて動かすドラッグの制御部。単体のドラッグと同じく、
// 4px のしきい値・離した座標での確定・Esc の取り消し・2 本目の指への譲り方を守る

function setup(overrides: { scale?: number; clamp?: (delta: Point) => Point } = {}) {
  const target = new FakeTarget()
  const scheduler = new FakeScheduler()
  const body = fakeBody()
  const followers: FollowElement[] = [{ style: { transform: '' } }, { style: { transform: '' } }]
  const log = {
    commits: [] as Point[],
    actives: [] as boolean[],
    getFollowersCalls: 0,
    captures: [] as number[],
    inBatch: false,
    commitInBatch: [] as boolean[],
    transformsAtBatchEnd: [] as string[],
  }
  const controller = createSelectionDragController({
    getTarget: () => target,
    getLock: (cursor) => ({ body, cursor }),
    getScale: () => overrides.scale ?? 1,
    getFollowers: () => {
      log.getFollowersCalls++
      return followers
    },
    clampDelta: overrides.clamp ?? ((delta) => delta),
    batch: (fn) => {
      log.inBatch = true
      try {
        fn()
      } finally {
        log.inBatch = false
        log.transformsAtBatchEnd.push(followers[0]!.style.transform)
      }
    },
    onCommit: (delta) => {
      log.commits.push(delta)
      log.commitInBatch.push(log.inBatch)
    },
    onActive: (active) => {
      log.actives.push(active)
    },
    scheduler,
  })
  const down = (x: number, y: number, pointerId = 1): SelectionDragPointerDown => ({
    pointerId,
    clientX: x,
    clientY: y,
    currentTarget: { setPointerCapture: (id: number) => log.captures.push(id) },
  })
  return { target, scheduler, body, followers, log, controller, down }
}

describe('しきい値と確定', () => {
  test('4px 未満はクリック(何も動かさない)。超えたら、その時点から追従する', () => {
    const { target, controller, down, followers, scheduler, log } = setup()
    controller.start(down(200, 200))
    const small = pointerEvent(1, 202, 202)
    target.dispatch('pointermove', small)
    expect(small.stopped).toBe(false)
    expect(log.getFollowersCalls).toBe(0)
    expect(log.actives).toEqual([])
    target.dispatch('pointerup', pointerEvent(1, 202, 202))
    expect(log.commits).toEqual([])
    expect(log.actives).toEqual([false])

    controller.start(down(200, 200))
    target.dispatch('pointermove', pointerEvent(1, 210, 206))
    expect(log.getFollowersCalls).toBe(1)
    expect(log.actives).toEqual([false, true])
    scheduler.flush()
    for (const f of followers) expect(f.style.transform).toBe('translate(10px, 6px)')
  })

  test('拡大率で割り、離したときの座標で確定する(最後の pointermove ではない)', () => {
    const { target, controller, down, scheduler, followers, log } = setup({ scale: 2 })
    controller.start(down(200, 200))
    target.dispatch('pointermove', pointerEvent(1, 240, 220))
    scheduler.flush()
    expect(followers[0]!.style.transform).toBe('translate(20px, 10px)')
    target.dispatch('pointerup', pointerEvent(1, 300, 260))
    expect(log.commits).toEqual([{ x: 50, y: 30 }])
  })

  test('座標の上限は、clampDelta を通した差分で確定する', () => {
    const { target, controller, down, log } = setup({
      clamp: (delta) => ({ x: Math.min(delta.x, 20), y: delta.y }),
    })
    controller.start(down(200, 200))
    target.dispatch('pointermove', pointerEvent(1, 300, 260))
    target.dispatch('pointerup', pointerEvent(1, 400, 300))
    expect(log.commits).toEqual([{ x: 20, y: 100 }])
  })

  test('確定は batch の中で 1 回だけ。batch が終わるまでは transform を残し、そのあと戻す', () => {
    const { target, controller, down, followers, scheduler, log } = setup()
    controller.start(down(200, 200))
    target.dispatch('pointermove', pointerEvent(1, 230, 240))
    scheduler.flush()
    target.dispatch('pointerup', pointerEvent(1, 260, 250))
    expect(log.commitInBatch).toEqual([true])
    expect(log.transformsAtBatchEnd).toEqual(['translate(30px, 40px)'])
    expect(followers[0]!.style.transform).toBe('')
    expect(log.actives).toEqual([true, false])
  })

  test('動かなかった(差分が 0 の)確定では、onCommit を呼ばない', () => {
    const { target, controller, down, log } = setup({ clamp: () => ({ x: 0, y: 0 }) })
    controller.start(down(200, 200))
    target.dispatch('pointermove', pointerEvent(1, 300, 300))
    target.dispatch('pointerup', pointerEvent(1, 300, 300))
    expect(log.commits).toEqual([])
    expect(log.actives).toEqual([true, false])
  })
})

describe('取り消し', () => {
  test('Esc は、確定せずに元に戻す。takeEscape は 1 回だけ true', () => {
    const { target, controller, down, followers, scheduler, log } = setup()
    controller.start(down(200, 200))
    target.dispatch('pointermove', pointerEvent(1, 300, 300))
    scheduler.flush()
    expect(followers[0]!.style.transform).not.toBe('')
    target.dispatch('keydown', { key: 'Escape' })
    expect(log.commits).toEqual([])
    expect(log.actives).toEqual([true, false])
    expect(followers[0]!.style.transform).toBe('')
    expect(controller.takeEscape()).toBe(true)
    expect(controller.takeEscape()).toBe(false)
  })

  test('pointercancel は、確定せずに元に戻す', () => {
    const { target, controller, down, log } = setup()
    controller.start(down(200, 200))
    target.dispatch('pointermove', pointerEvent(1, 300, 300))
    target.dispatch('pointercancel', pointerEvent(1, 300, 300))
    expect(log.commits).toEqual([])
    expect(log.actives).toEqual([true, false])
  })

  test('2 本目の指が押されたら、確定前は取りやめて、ピンチに譲る', () => {
    const { target, controller, down, log } = setup()
    controller.start(down(200, 200))
    target.dispatch('pointerdown', pointerEvent(2, 210, 210))
    expect(controller.isActive()).toBe(false)
    expect(log.commits).toEqual([])
    expect(target.count).toBe(0)
  })

  test('dispose は、ドラッグ中でも後始末する', () => {
    const { target, controller, down, followers, scheduler, log } = setup()
    controller.start(down(200, 200))
    target.dispatch('pointermove', pointerEvent(1, 300, 300))
    scheduler.flush()
    expect(followers[0]!.style.transform).not.toBe('')
    controller.dispose()
    expect(followers[0]!.style.transform).toBe('')
    expect(log.actives).toEqual([true, false])
    expect(target.count).toBe(0)
  })
})
