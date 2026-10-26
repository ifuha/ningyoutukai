import { describe, expect, test } from 'bun:test'
import {
  createCardDragController,
  type CardPointerDown,
  type DragView,
  type GhostElement,
  type UseCardDragOptions,
} from '#/lib/use-card-drag'
import type { Point, Rect } from '#/lib/section-edit-geometry'
import { FakeScheduler, FakeTarget, fakeBody, pointerEvent } from '#/lib/drag-test-support'

// カードのドラッグの制御部(window で動きを受ける)を、偽のイベント・偽の window で検証する。
// 「速く動かして、押したカードの外へ出ても追従する」ことと、離したときの座標で決まること、後始末を守る

const CARD: Rect = { x: 100, y: 100, width: 240, height: 130 }
const SECTION = { sectionId: 's1', x: 0, y: 0, width: 2000, height: 2000, createdAt: '2026-01-01T00:00:00Z' }

function setup(overrides: { enabled?: boolean; scale?: number; sections?: UseCardDragOptions['sections'] } = {}) {
  const target = new FakeTarget()
  const scheduler = new FakeScheduler()
  const body = fakeBody()
  const log = {
    drops: [] as Array<{ memberId: string; position: Point; sectionId: string | null }>,
    views: [] as Array<DragView | null>,
    clicks: 0,
    batches: 0,
    inBatch: false,
    dropInBatch: [] as boolean[],
    captures: [] as number[],
    stopped: 0,
  }
  const options: UseCardDragOptions = {
    enabled: overrides.enabled ?? true,
    scale: overrides.scale ?? 1,
    sections: overrides.sections ?? [],
    getCardRect: () => CARD,
    onDrop: (memberId, position, sectionId) => {
      log.drops.push({ memberId, position, sectionId })
      log.dropInBatch.push(log.inBatch)
    },
  }
  const controller = createCardDragController({
    getTarget: () => target,
    getLock: () => ({ body, cursor: 'grabbing' }),
    getOptions: () => options,
    onView: (v) => log.views.push(v),
    batch: (fn) => {
      log.batches++
      log.inBatch = true
      try {
        fn()
      } finally {
        log.inBatch = false
      }
    },
    suppressClick: () => {
      log.clicks++
    },
    scheduler,
  })
  const ghost: GhostElement = { style: { transform: '' } }
  const down = (x: number, y: number, over: Partial<CardPointerDown> = {}): CardPointerDown => ({
    pointerId: 1,
    pointerType: 'mouse',
    button: 0,
    isPrimary: true,
    clientX: x,
    clientY: y,
    currentTarget: { setPointerCapture: (id: number) => log.captures.push(id) },
    stopPropagation: () => {
      log.stopped++
    },
    ...over,
  })
  return { target, scheduler, body, log, options, controller, ghost, down }
}

describe('速く動かしても、押したカードの外へ出ても、追従する(window で受ける)', () => {
  test('押したあと、最初の動きが、カードの外のはるか遠くでも、ドラッグとして始まる(パンに奪われない)', () => {
    const { target, controller, down, log, ghost, scheduler } = setup()
    controller.setGhost(ghost)
    controller.pointerDown('m1', down(150, 120))
    // カードの要素には何も届かない。window(受け手)に、いきなり遠い動きが来る
    const move = pointerEvent(1, 900, 700)
    target.dispatch('pointermove', move)
    expect(controller.getState().phase).toBe('dragging')
    // パンに渡さない(キャプチャ段階で止める)
    expect(move.stopped).toBe(true)
    expect(log.views.at(-1)?.memberId).toBe('m1')
    scheduler.flush()
    // 位置は、開始時の位置 + 差分(750, 580)。影の基準(元の位置)からの差分が transform
    expect(ghost.style.transform).toBe('translate(750px, 580px)')
  })

  test('押した直後は、イベントを止めない(パンにも記録させる)。確定前の小さな動きも、止めない', () => {
    const { target, controller, down, log } = setup()
    controller.pointerDown('m1', down(150, 120))
    expect(log.stopped).toBe(0)
    const small = pointerEvent(1, 152, 121)
    target.dispatch('pointermove', small)
    expect(controller.getState().phase).toBe('pending')
    expect(small.stopped).toBe(false)
    expect(log.views).toEqual([])
  })

  test('途中の動きを間引いても(速く動かしても)、最後の位置で決まる(差分の積み重ねではない)', () => {
    const { target, controller, down, ghost, scheduler } = setup()
    controller.setGhost(ghost)
    controller.pointerDown('m1', down(150, 120))
    target.dispatch('pointermove', pointerEvent(1, 160, 130))
    target.dispatch('pointermove', pointerEvent(1, 5000, 4000)) // 途中の動きを、すべて飛ばした
    target.dispatch('pointermove', pointerEvent(1, 400, 300))
    scheduler.flush()
    expect(ghost.style.transform).toBe('translate(250px, 180px)')
  })

  test('拡大率で割る(画面の差分 / scale がキャンバスの差分)', () => {
    const { target, controller, down, ghost, scheduler } = setup({ scale: 2 })
    controller.setGhost(ghost)
    controller.pointerDown('m1', down(150, 120))
    target.dispatch('pointermove', pointerEvent(1, 550, 520))
    scheduler.flush()
    expect(ghost.style.transform).toBe('translate(200px, 200px)')
  })

  test('離したときの座標で、最終の位置を決める(最後の pointermove ではない)', () => {
    const { target, controller, down, log } = setup()
    controller.pointerDown('m1', down(150, 120))
    target.dispatch('pointermove', pointerEvent(1, 300, 200))
    target.dispatch('pointerup', pointerEvent(1, 350, 260))
    expect(log.drops).toEqual([{ memberId: 'm1', position: { x: 300, y: 240 }, sectionId: null }])
  })

  test('離したとき、影の消去と onDrop が、同じ batch(同時に反映)の中で行われる。1 回だけ', () => {
    const { target, controller, down, log } = setup()
    controller.pointerDown('m1', down(150, 120))
    target.dispatch('pointermove', pointerEvent(1, 300, 200))
    target.dispatch('pointerup', pointerEvent(1, 350, 260))
    expect(log.batches).toBe(1)
    expect(log.dropInBatch).toEqual([true])
    expect(log.views.at(-1)).toBeNull()
    // 離したあとの動き・離しは、何も起こさない
    target.dispatch('pointermove', pointerEvent(1, 999, 999))
    target.dispatch('pointerup', pointerEvent(1, 999, 999))
    expect(log.drops.length).toBe(1)
  })
})

describe('見え方(React の状態)は、動くたびには変えない', () => {
  test('動きを 50 回送っても、見え方の更新は「開始」と「終了」の 2 回だけ(ドロップ先が変わらない間)', () => {
    const { target, controller, down, log, scheduler } = setup({ sections: [SECTION] })
    controller.pointerDown('m1', down(150, 120))
    for (let i = 1; i <= 50; i++) target.dispatch('pointermove', pointerEvent(1, 150 + i * 10, 120 + i * 6))
    expect(scheduler.pending.size).toBe(1) // 1 フレームに 1 回の予約だけ
    target.dispatch('pointerup', pointerEvent(1, 650, 420))
    expect(log.views.length).toBe(2)
    expect(log.views[0]?.hoverSectionId).toBe('s1')
    expect(log.views[1]).toBeNull()
  })

  test('ドロップ先のセクションが変わったときだけ、見え方を更新する', () => {
    const small = { ...SECTION, sectionId: 's-small', x: 0, y: 0, width: 300, height: 300 }
    const { target, controller, down, log } = setup({ sections: [small] })
    controller.pointerDown('m1', down(150, 120))
    target.dispatch('pointermove', pointerEvent(1, 160, 130)) // 中心がセクションの中
    target.dispatch('pointermove', pointerEvent(1, 170, 140)) // 同じ
    target.dispatch('pointermove', pointerEvent(1, 2000, 2000)) // 外へ出た
    target.dispatch('pointermove', pointerEvent(1, 2100, 2100)) // 外のまま
    expect(log.views.map((v) => v?.hoverSectionId)).toEqual(['s-small', null])
  })

  test('1 フレームに 1 回だけ、影の transform に書く(最新の位置で)', () => {
    const { target, controller, down, ghost, scheduler } = setup()
    controller.setGhost(ghost)
    controller.pointerDown('m1', down(150, 120))
    target.dispatch('pointermove', pointerEvent(1, 250, 220))
    target.dispatch('pointermove', pointerEvent(1, 350, 320))
    expect(ghost.style.transform).toBe('') // フレームが来るまで、書かない
    scheduler.flush()
    expect(ghost.style.transform).toBe('translate(200px, 200px)')
  })

  test('影の要素が、ドラッグの開始より遅れて出てきても、出た瞬間に最新の位置を書く', () => {
    const { target, controller, down, ghost } = setup()
    controller.pointerDown('m1', down(150, 120))
    target.dispatch('pointermove', pointerEvent(1, 450, 420))
    controller.setGhost(ghost)
    expect(ghost.style.transform).toBe('translate(300px, 300px)')
  })
})

describe('固定と捕捉', () => {
  test('確定する前は、固定も捕捉もしない。確定したら、user-select とカーソルを固定し、カードを捕捉する。離したら戻す', () => {
    const { target, controller, down, body, log } = setup()
    controller.pointerDown('m1', down(150, 120))
    target.dispatch('pointermove', pointerEvent(1, 152, 121))
    expect(body.style.userSelect).toBe('auto')
    expect(log.captures).toEqual([])
    target.dispatch('pointermove', pointerEvent(1, 250, 220))
    expect(body.style.userSelect).toBe('none')
    expect(body.style.cursor).toBe('grabbing')
    expect(log.captures).toEqual([1])
    target.dispatch('pointerup', pointerEvent(1, 250, 220))
    expect(body.style.userSelect).toBe('auto')
    expect(body.style.cursor).toBe('default')
  })

  test('クリックだけ(動かさずに離す)なら、何も起こさない(drop も、click の抑止もしない)', () => {
    const { target, controller, down, log } = setup()
    controller.pointerDown('m1', down(150, 120))
    target.dispatch('pointerup', pointerEvent(1, 150, 120))
    expect(log.drops).toEqual([])
    expect(log.clicks).toBe(0)
    expect(target.count).toBe(0)
  })

  test('ドラッグして、離したら、click を 1 回抑止する', () => {
    const { target, controller, down, log } = setup()
    controller.pointerDown('m1', down(150, 120))
    target.dispatch('pointermove', pointerEvent(1, 250, 220))
    target.dispatch('pointerup', pointerEvent(1, 250, 220))
    expect(log.clicks).toBe(1)
  })

  test('動いたあとで、元の位置に戻して離したら、drop はしない。click は抑止する', () => {
    const { target, controller, down, log } = setup()
    controller.pointerDown('m1', down(150, 120))
    target.dispatch('pointermove', pointerEvent(1, 250, 220))
    target.dispatch('pointerup', pointerEvent(1, 150, 120))
    expect(log.drops).toEqual([])
    expect(log.clicks).toBe(1)
  })
})

describe('取りやめ・後始末', () => {
  test('pointercancel: drop も click の抑止もなく、リスナーが全部外れる', () => {
    const { target, controller, down, log, body } = setup()
    controller.pointerDown('m1', down(150, 120))
    target.dispatch('pointermove', pointerEvent(1, 250, 220))
    target.dispatch('pointercancel', pointerEvent(1, 250, 220))
    expect(log.drops).toEqual([])
    expect(log.clicks).toBe(0)
    expect(log.views.at(-1)).toBeNull()
    expect(target.count).toBe(0)
    expect(body.style.userSelect).toBe('auto')
  })

  test('Esc: 取りやめ(drop しない)。離すまで、動きを呑み込み(パンに渡さない)、離したら click を抑止する', () => {
    const { target, controller, down, log } = setup()
    controller.pointerDown('m1', down(150, 120))
    target.dispatch('pointermove', pointerEvent(1, 250, 220))
    target.dispatch('keydown', { key: 'Escape' })
    expect(log.views.at(-1)).toBeNull()
    const after = pointerEvent(1, 400, 400)
    target.dispatch('pointermove', after)
    expect(after.stopped).toBe(true) // 離すまで、パンが始まらない
    expect(log.drops).toEqual([])
    target.dispatch('pointerup', pointerEvent(1, 400, 400))
    expect(log.drops).toEqual([])
    expect(log.clicks).toBe(1)
    expect(target.count).toBe(0)
  })

  test('確定前の Esc: 動きは呑み込むが、離しても click は抑止しない(クリックだったかもしれない)', () => {
    const { target, controller, down, log } = setup()
    controller.pointerDown('m1', down(150, 120))
    target.dispatch('keydown', { key: 'Escape' })
    target.dispatch('pointerup', pointerEvent(1, 150, 120))
    expect(log.clicks).toBe(0)
    expect(target.count).toBe(0)
  })

  test('window が非アクティブ(blur)になったら、取り消す(drop しない)。リスナーは外れる', () => {
    const { target, controller, down, log } = setup()
    controller.pointerDown('m1', down(150, 120))
    target.dispatch('pointermove', pointerEvent(1, 250, 220))
    target.dispatch('blur', {})
    expect(log.drops).toEqual([])
    expect(target.count).toBe(0)
  })

  test('使えなくなったとき(disable)は、途中のドラッグを取りやめる。drop しない', () => {
    const { target, controller, down, log } = setup()
    controller.pointerDown('m1', down(150, 120))
    target.dispatch('pointermove', pointerEvent(1, 250, 220))
    controller.disable()
    expect(log.views.at(-1)).toBeNull()
    target.dispatch('pointerup', pointerEvent(1, 250, 220))
    expect(log.drops).toEqual([])
  })

  test('画面から消えるとき(dispose)は、リスナーを外す', () => {
    const { target, controller, down } = setup()
    controller.pointerDown('m1', down(150, 120))
    expect(target.count).toBeGreaterThan(0)
    controller.dispose()
    expect(target.count).toBe(0)
  })

  test('何回ドラッグしても、リスナーが溜まらない', () => {
    const { target, controller, down } = setup()
    for (let i = 0; i < 5; i++) {
      controller.pointerDown('m1', down(150, 120))
      target.dispatch('pointermove', pointerEvent(1, 250, 220))
      target.dispatch('pointerup', pointerEvent(1, 250, 220))
    }
    expect(target.count).toBe(0)
  })

  test('離しが届かなかったあと(同じ pointerId で、また押された)は、新しい操作として始める', () => {
    const { target, controller, down, log } = setup()
    controller.pointerDown('m1', down(150, 120))
    target.dispatch('pointermove', pointerEvent(1, 250, 220))
    // 離しが届かなかった。同じ pointerId で、また押す
    controller.pointerDown('m1', down(150, 120))
    target.dispatch('pointermove', pointerEvent(1, 350, 320))
    target.dispatch('pointerup', pointerEvent(1, 350, 320))
    expect(log.drops.length).toBe(1)
    expect(target.count).toBe(0)
  })
})

describe('押し方の条件', () => {
  test('使えない(enabled が false)ときは、何も始めない(リスナーも付けない。パンを妨げない)', () => {
    const { target, controller, down, log } = setup({ enabled: false })
    controller.pointerDown('m1', down(150, 120))
    expect(target.count).toBe(0)
    expect(log.stopped).toBe(0)
  })

  test('右クリックは無視する', () => {
    const { target, controller, down } = setup()
    controller.pointerDown('m1', down(150, 120, { button: 2 }))
    expect(target.count).toBe(0)
  })

  test('2 本目以降の指(主でないポインタ)の押しは、ドラッグを始めない(ピンチに譲る)', () => {
    const { target, controller, down } = setup()
    controller.pointerDown('m1', down(150, 120, { pointerId: 2, pointerType: 'touch', isPrimary: false }))
    expect(target.count).toBe(0)
  })

  test('確定前に 2 本目の指が押されたら、取りやめる(ピンチに譲る。押しは止めない)', () => {
    const { target, controller, down, log } = setup()
    controller.pointerDown('m1', down(150, 120, { pointerType: 'touch' }))
    const second = pointerEvent(2, 300, 300)
    target.dispatch('pointerdown', second)
    expect(second.stopped).toBe(false)
    expect(controller.getState().phase).toBe('idle')
    expect(target.count).toBe(0)
    expect(log.drops).toEqual([])
  })

  test('ドラッグ中に 2 本目の指が押されたら、無視して、パンにも渡さない(ドラッグは変わらない)', () => {
    const { target, controller, down, log } = setup()
    controller.pointerDown('m1', down(150, 120, { pointerType: 'touch' }))
    target.dispatch('pointermove', pointerEvent(1, 250, 220))
    const second = pointerEvent(2, 300, 300)
    target.dispatch('pointerdown', second)
    expect(second.stopped).toBe(true)
    expect(controller.getState().phase).toBe('dragging')
    target.dispatch('pointerup', pointerEvent(1, 250, 220))
    expect(log.drops.length).toBe(1)
  })

  test('別のポインタの動き・離しは、この操作に使わない', () => {
    const { target, controller, down, log } = setup()
    controller.pointerDown('m1', down(150, 120))
    target.dispatch('pointermove', pointerEvent(2, 900, 900))
    target.dispatch('pointerup', pointerEvent(2, 900, 900))
    expect(controller.getState().phase).toBe('pending')
    expect(log.drops).toEqual([])
  })
})
