import { describe, expect, test } from 'bun:test'
import { createSectionDragController, type SectionDragPointerDown } from '#/lib/section-drag-controller'
import { createCardDragController, type CardPointerDown, type GhostElement } from '#/lib/use-card-drag'
import type { ConnectorFollower } from '#/lib/connector-follow'
import type { Rect } from '#/lib/section-edit-geometry'
import { FakeScheduler, FakeTarget, fakeBody, pointerEvent } from '#/lib/drag-test-support'

// ドラッグ中に、親子の線(SVG)が、動くカードに追従することを守る。
// 制御部が、線の部品を「確定したときに 1 回」作り、「1 フレームに 1 回、元の位置からの差分」を渡し、
// 「確定したなら戻さず、確定しなかったら戻す」ことを確かめる(線の描き直し自体は connector-follow.test.ts)

function fakeConnectors() {
  const log = { created: 0, applied: [] as Array<[number, number]>, finished: [] as boolean[] }
  const follower: ConnectorFollower = {
    apply: (dx, dy) => log.applied.push([dx, dy]),
    finish: (committed) => log.finished.push(committed),
  }
  return {
    log,
    make: () => {
      log.created++
      return follower
    },
  }
}

const BASE: Rect = { x: 100, y: 100, width: 300, height: 400 }

function sectionSetup() {
  const target = new FakeTarget()
  const scheduler = new FakeScheduler()
  const conn = fakeConnectors()
  const controller = createSectionDragController({
    getTarget: () => target,
    getLock: (cursor) => ({ body: fakeBody(), cursor }),
    getBase: () => BASE,
    getScale: () => 1,
    getFollowers: () => [],
    getConnectors: conn.make,
    batch: (fn) => fn(),
    onCommit: () => {},
    onPreview: () => {},
    onLive: () => {},
    onActive: () => {},
    scheduler,
  })
  const down = (x: number, y: number): SectionDragPointerDown => ({
    pointerId: 1,
    clientX: x,
    clientY: y,
    currentTarget: { setPointerCapture: () => {} },
  })
  return { target, scheduler, conn, controller, down }
}

describe('セクションの移動: 親子の線が追従する', () => {
  test('確定したときに 1 回だけ作り、1 フレームに 1 回、押した点からの差分を渡す', () => {
    const { target, scheduler, conn, controller, down } = sectionSetup()
    controller.start({ type: 'move' }, down(200, 200))
    expect(conn.log.created).toBe(0) // 押しただけ(4px 以内)では作らない
    for (let i = 1; i <= 50; i++) target.dispatch('pointermove', pointerEvent(1, 200 + i * 4, 200 + i * 2))
    expect(conn.log.created).toBe(1)
    expect(conn.log.applied).toEqual([]) // フレームが来るまで書かない
    scheduler.flush()
    expect(conn.log.applied).toEqual([[200, 100]])
  })

  test('確定(離して、四角が変わった)なら、線は戻さない', () => {
    const { target, conn, controller, down } = sectionSetup()
    controller.start({ type: 'move' }, down(200, 200))
    target.dispatch('pointermove', pointerEvent(1, 300, 260))
    target.dispatch('pointerup', pointerEvent(1, 380, 330))
    expect(conn.log.finished).toEqual([true])
  })

  test('元の位置に戻して離したら(確定しない)、線を元に戻す', () => {
    const { target, scheduler, conn, controller, down } = sectionSetup()
    controller.start({ type: 'move' }, down(200, 200))
    target.dispatch('pointermove', pointerEvent(1, 300, 300))
    scheduler.flush()
    target.dispatch('pointerup', pointerEvent(1, 200, 200))
    expect(conn.log.finished).toEqual([false])
  })

  for (const how of ['escape', 'pointercancel', 'blur'] as const) {
    test(`${how}: 線を元に戻す`, () => {
      const { target, scheduler, conn, controller, down } = sectionSetup()
      controller.start({ type: 'move' }, down(200, 200))
      target.dispatch('pointermove', pointerEvent(1, 400, 400))
      scheduler.flush()
      if (how === 'escape') target.dispatch('keydown', { key: 'Escape' })
      else if (how === 'pointercancel') target.dispatch('pointercancel', pointerEvent(1, 400, 400))
      else target.dispatch('blur', {})
      expect(conn.log.finished).toEqual([false])
    })
  }

  test('cancel() と dispose() も、線を元に戻す。戻したあとは、二重に戻さない', () => {
    const a = sectionSetup()
    a.controller.start({ type: 'move' }, a.down(200, 200))
    a.target.dispatch('pointermove', pointerEvent(1, 400, 400))
    a.controller.cancel()
    a.controller.cancel()
    expect(a.conn.log.finished).toEqual([false])

    const b = sectionSetup()
    b.controller.start({ type: 'move' }, b.down(200, 200))
    b.target.dispatch('pointermove', pointerEvent(1, 400, 400))
    b.controller.dispose()
    expect(b.conn.log.finished).toEqual([false])
  })

  test('大きさの変更(ハンドル)では、線を動かさない(カードは動かない)', () => {
    const { target, scheduler, conn, controller, down } = sectionSetup()
    controller.start({ type: 'resize', handle: 'se' }, down(400, 500))
    target.dispatch('pointermove', pointerEvent(1, 500, 600))
    scheduler.flush()
    expect(conn.log.created).toBe(0)
    expect(conn.log.applied).toEqual([])
  })

  test('線の部品を渡さなくても動く(省略可)', () => {
    const target = new FakeTarget()
    const scheduler = new FakeScheduler()
    const controller = createSectionDragController({
      getTarget: () => target,
      getBase: () => BASE,
      getScale: () => 1,
      getFollowers: () => [],
      batch: (fn) => fn(),
      onCommit: () => {},
      onPreview: () => {},
      onLive: () => {},
      onActive: () => {},
      scheduler,
    })
    controller.start({ type: 'move' }, { pointerId: 1, clientX: 200, clientY: 200, currentTarget: { setPointerCapture: () => {} } })
    target.dispatch('pointermove', pointerEvent(1, 400, 400))
    scheduler.flush()
    target.dispatch('pointerup', pointerEvent(1, 400, 400))
    expect(controller.isActive()).toBe(false)
  })
})

const CARD: Rect = { x: 100, y: 100, width: 240, height: 130 }

function cardSetup() {
  const target = new FakeTarget()
  const scheduler = new FakeScheduler()
  const conn = fakeConnectors()
  const ids: string[] = []
  const drops: string[] = []
  const controller = createCardDragController({
    getTarget: () => target,
    getLock: () => ({ body: fakeBody(), cursor: 'grabbing' }),
    getOptions: () => ({
      enabled: true,
      scale: 1,
      sections: [],
      getCardRect: () => CARD,
      onDrop: (memberId) => drops.push(memberId),
    }),
    getConnectors: (memberId) => {
      ids.push(memberId)
      return conn.make()
    },
    onView: () => {},
    batch: (fn) => fn(),
    suppressClick: () => {},
    scheduler,
  })
  const ghost: GhostElement = { style: { transform: '' } }
  const down = (x: number, y: number): CardPointerDown => ({
    pointerId: 1,
    pointerType: 'mouse',
    button: 0,
    isPrimary: true,
    clientX: x,
    clientY: y,
    currentTarget: { setPointerCapture: () => {} },
    stopPropagation: () => {},
  })
  return { target, scheduler, conn, ids, drops, controller, ghost, down }
}

describe('カードのドラッグ: 親子の線が追従する', () => {
  test('確定したときに、動かすカードの id で 1 回作り、1 フレームに 1 回、差分を渡す(影のカードがなくても)', () => {
    const { target, scheduler, conn, ids, controller, down } = cardSetup()
    controller.pointerDown('m1', down(150, 150))
    expect(conn.log.created).toBe(0) // 押しただけでは作らない
    for (let i = 1; i <= 50; i++) target.dispatch('pointermove', pointerEvent(1, 150 + i * 4, 150 + i * 2))
    expect(ids).toEqual(['m1'])
    expect(conn.log.created).toBe(1)
    scheduler.flush()
    expect(conn.log.applied).toEqual([[200, 100]])
  })

  test('影のカードの transform と、線の差分が、同じ値になる', () => {
    const { target, scheduler, conn, controller, ghost, down } = cardSetup()
    controller.pointerDown('m1', down(150, 150))
    controller.setGhost(ghost)
    target.dispatch('pointermove', pointerEvent(1, 350, 250))
    scheduler.flush()
    expect(ghost.style.transform).toBe('translate(200px, 100px)')
    expect(conn.log.applied.at(-1)).toEqual([200, 100])
  })

  test('落とした(確定)なら、線は戻さない', () => {
    const { target, conn, drops, controller, down } = cardSetup()
    controller.pointerDown('m1', down(150, 150))
    target.dispatch('pointermove', pointerEvent(1, 350, 250))
    target.dispatch('pointerup', pointerEvent(1, 360, 260))
    expect(drops).toEqual(['m1'])
    expect(conn.log.finished).toEqual([true])
  })

  test('Esc で取り消したら、線を元に戻す', () => {
    const { target, scheduler, conn, controller, down } = cardSetup()
    controller.pointerDown('m1', down(150, 150))
    target.dispatch('pointermove', pointerEvent(1, 350, 250))
    scheduler.flush()
    target.dispatch('keydown', { key: 'Escape' })
    expect(conn.log.finished).toEqual([false])
  })

  test('クリック(動かさずに離す)では、線の部品を作らない', () => {
    const { target, conn, controller, down } = cardSetup()
    controller.pointerDown('m1', down(150, 150))
    target.dispatch('pointerup', pointerEvent(1, 150, 150))
    expect(conn.log.created).toBe(0)
    expect(conn.log.finished).toEqual([])
  })
})
