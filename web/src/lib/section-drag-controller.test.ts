import { describe, expect, test } from 'bun:test'
import { createSectionDragController, type SectionDragPointerDown } from '#/lib/section-drag-controller'
import type { FollowElement } from '#/lib/drag-follow'
import type { Rect } from '#/lib/section-edit-geometry'
import { FakeScheduler, FakeTarget, fakeBody, pointerEvent } from '#/lib/drag-test-support'

// セクションの移動・大きさの変更の制御部(window で受ける)を、偽のイベントで検証する。
// 「速く動かしても追従する」「四角・編集枠・中のカードが、transform で一緒に動く」「離したときの座標で決まる」を守る

const BASE: Rect = { x: 100, y: 100, width: 300, height: 400 }

function setup(overrides: { scale?: number } = {}) {
  const target = new FakeTarget()
  const scheduler = new FakeScheduler()
  const body = fakeBody()
  const followers: FollowElement[] = [{ style: { transform: '' } }, { style: { transform: '' } }]
  const log = {
    order: [] as string[],
    commits: [] as Rect[],
    previews: [] as Array<Rect | null>,
    lives: [] as Array<Rect | null>,
    actives: [] as boolean[],
    getFollowersCalls: 0,
    captures: [] as number[],
    inBatch: false,
    commitInBatch: [] as boolean[],
    transformsAtBatchEnd: [] as string[],
  }
  const controller = createSectionDragController({
    getTarget: () => target,
    getLock: (cursor) => ({ body, cursor }),
    getBase: () => BASE,
    getScale: () => overrides.scale ?? 1,
    getFollowers: () => {
      log.getFollowersCalls++
      return followers
    },
    batch: (fn) => {
      log.inBatch = true
      try {
        fn()
      } finally {
        log.inBatch = false
        log.transformsAtBatchEnd.push(followers[0]!.style.transform)
      }
    },
    onCommit: (r) => {
      log.order.push('commit')
      log.commits.push(r)
      log.commitInBatch.push(log.inBatch)
    },
    onPreview: (r) => {
      log.order.push(r ? 'preview' : 'preview-null')
      log.previews.push(r)
    },
    onLive: (r) => {
      log.lives.push(r)
    },
    onActive: (a) => {
      log.order.push(a ? 'active' : 'active-false')
      log.actives.push(a)
    },
    scheduler,
  })
  const down = (x: number, y: number, pointerId = 1): SectionDragPointerDown => ({
    pointerId,
    clientX: x,
    clientY: y,
    currentTarget: { setPointerCapture: (id: number) => log.captures.push(id) },
  })
  return { target, scheduler, body, followers, log, controller, down }
}

describe('移動: 速く動かしても、四角・編集枠・中のカードが、マウスに追従する', () => {
  test('押したあと、最初の動きが遠くても、ドラッグとして始まり、transform が押した点からの差分になる', () => {
    const { target, controller, down, followers, scheduler, log } = setup()
    controller.start({ type: 'move' }, down(200, 200))
    const move = pointerEvent(1, 900, 700)
    target.dispatch('pointermove', move)
    expect(move.stopped).toBe(true) // パンに渡さない
    expect(log.getFollowersCalls).toBe(1)
    scheduler.flush()
    for (const f of followers) expect(f.style.transform).toBe('translate(700px, 500px)')
    expect(log.actives).toEqual([true])
    expect(log.previews).toEqual([BASE]) // 確定したときに 1 回(動くたびには呼ばない)
  })

  test('途中の動きを間引いても、最後の位置で決まる(押した点からの絶対計算)', () => {
    const { target, controller, down, followers, scheduler } = setup()
    controller.start({ type: 'move' }, down(200, 200))
    target.dispatch('pointermove', pointerEvent(1, 230, 210))
    target.dispatch('pointermove', pointerEvent(1, 9000, 8000))
    target.dispatch('pointermove', pointerEvent(1, 260, 250))
    scheduler.flush()
    expect(followers[0]!.style.transform).toBe('translate(60px, 50px)')
  })

  test('拡大率で割る', () => {
    const { target, controller, down, followers, scheduler } = setup({ scale: 2 })
    controller.start({ type: 'move' }, down(200, 200))
    target.dispatch('pointermove', pointerEvent(1, 600, 400))
    scheduler.flush()
    expect(followers[0]!.style.transform).toBe('translate(200px, 100px)')
  })

  test('動かす要素は、確定したときに 1 回だけ集める(動くたびには探さない)。動きは 1 フレームに 1 回だけ書く', () => {
    const { target, controller, down, scheduler, log, followers } = setup()
    controller.start({ type: 'move' }, down(200, 200))
    for (let i = 1; i <= 100; i++) target.dispatch('pointermove', pointerEvent(1, 200 + i * 5, 200 + i * 3))
    expect(log.getFollowersCalls).toBe(1)
    expect(scheduler.pending.size).toBe(1)
    expect(followers[0]!.style.transform).toBe('') // フレームが来るまで、書かない
    scheduler.flush()
    expect(followers[0]!.style.transform).toBe('translate(500px, 300px)')
    // フレームを進めても、動かす要素は探し直さない(動くたびに document を探さない)
    target.dispatch('pointermove', pointerEvent(1, 900, 600))
    scheduler.flush()
    target.dispatch('pointermove', pointerEvent(1, 950, 650))
    scheduler.flush()
    expect(log.getFollowersCalls).toBe(1)
    expect(followers[0]!.style.transform).toBe('translate(750px, 450px)')
  })

  test('離したときの座標で、確定する四角を決める(最後の pointermove ではない)', () => {
    const { target, controller, down, log } = setup()
    controller.start({ type: 'move' }, down(200, 200))
    target.dispatch('pointermove', pointerEvent(1, 300, 260))
    target.dispatch('pointerup', pointerEvent(1, 380, 330))
    expect(log.commits).toEqual([{ x: 280, y: 230, width: 300, height: 400 }])
  })

  test('確定(onCommit)は batch の中で、1 回だけ。そのあとで transform を戻す(間に、元の位置が見えない)', () => {
    const { target, controller, down, log, followers, scheduler } = setup()
    controller.start({ type: 'move' }, down(200, 200))
    target.dispatch('pointermove', pointerEvent(1, 300, 260))
    scheduler.flush()
    expect(followers[0]!.style.transform).not.toBe('')
    target.dispatch('pointerup', pointerEvent(1, 380, 330))
    expect(log.commitInBatch).toEqual([true])
    // batch が終わった時点では、まだ transform が残っている(楽観更新が反映された、同じ瞬間に、戻す)
    expect(log.transformsAtBatchEnd[0]).not.toBe('')
    expect(followers[0]!.style.transform).toBe('')
    expect(log.order).toEqual(['active', 'preview', 'commit', 'active-false', 'preview-null'])
    // 離したあとの動き・離しは、何も起こさない
    target.dispatch('pointermove', pointerEvent(1, 999, 999))
    target.dispatch('pointerup', pointerEvent(1, 999, 999))
    expect(log.commits.length).toBe(1)
  })

  test('動かして、元の位置に戻して離したら、確定しない', () => {
    const { target, controller, down, log, followers } = setup()
    controller.start({ type: 'move' }, down(200, 200))
    target.dispatch('pointermove', pointerEvent(1, 300, 300))
    target.dispatch('pointerup', pointerEvent(1, 200, 200))
    expect(log.commits).toEqual([])
    expect(followers[0]!.style.transform).toBe('')
    expect(log.actives).toEqual([true, false])
  })

  test('座標の上限(±1,000,000)に収める', () => {
    const { target, controller, down, scheduler, followers } = setup()
    controller.start({ type: 'move' }, down(0, 0))
    target.dispatch('pointermove', pointerEvent(1, 5_000_000, 0))
    scheduler.flush()
    // x は 100 + 5,000,000 を上限 1,000,000 に収めた分の差分
    expect(followers[0]!.style.transform).toBe(`translate(${1_000_000 - BASE.x}px, 0px)`)
  })
})

describe('クリック(4px 以内)', () => {
  test('動かさずに離したら、何も起こさない(確定しない・動かす要素も集めない・パンを止めない)', () => {
    const { target, controller, down, log } = setup()
    controller.start({ type: 'move' }, down(200, 200))
    const small = pointerEvent(1, 202, 201)
    target.dispatch('pointermove', small)
    expect(small.stopped).toBe(false)
    target.dispatch('pointerup', pointerEvent(1, 203, 202))
    expect(log.commits).toEqual([])
    expect(log.getFollowersCalls).toBe(0)
    expect(log.actives).toEqual([false]) // 確定していない(開始の通知はなく、終わりの後始末だけ)
    expect(target.count).toBe(0)
  })

  test('4px ちょうどはクリック。それを超えたらドラッグ', () => {
    const { target, controller, down, log } = setup()
    controller.start({ type: 'move' }, down(200, 200))
    target.dispatch('pointermove', pointerEvent(1, 204, 200))
    expect(log.getFollowersCalls).toBe(0)
    target.dispatch('pointermove', pointerEvent(1, 205, 200))
    expect(log.getFollowersCalls).toBe(1)
  })

  test('確定前は、テキストの選択もカーソルも固定しない', () => {
    const { target, controller, down, body } = setup()
    controller.start({ type: 'move' }, down(200, 200))
    target.dispatch('pointermove', pointerEvent(1, 202, 200))
    expect(body.style.userSelect).toBe('auto')
  })
})

describe('取り消しと後始末', () => {
  for (const how of ['escape', 'pointercancel', 'blur'] as const) {
    test(`${how}: 確定せず、transform を戻し、リスナーが全部外れる`, () => {
      const { target, controller, down, log, followers, scheduler, body } = setup()
      controller.start({ type: 'move' }, down(200, 200))
      target.dispatch('pointermove', pointerEvent(1, 400, 400))
      scheduler.flush()
      expect(followers[0]!.style.transform).not.toBe('')
      if (how === 'escape') target.dispatch('keydown', { key: 'Escape' })
      else if (how === 'pointercancel') target.dispatch('pointercancel', pointerEvent(1, 400, 400))
      else target.dispatch('blur', {})
      expect(log.commits).toEqual([])
      expect(followers[0]!.style.transform).toBe('')
      expect(log.actives.at(-1)).toBe(false)
      expect(log.previews.at(-1)).toBeNull()
      expect(target.count).toBe(0)
      expect(body.style.userSelect).toBe('auto')
      expect(controller.isActive()).toBe(false)
    })
  }

  test('cancel()(使えなくなったとき)も、確定せずに戻す', () => {
    const { target, controller, down, log, followers, scheduler } = setup()
    controller.start({ type: 'move' }, down(200, 200))
    target.dispatch('pointermove', pointerEvent(1, 400, 400))
    scheduler.flush()
    controller.cancel()
    expect(log.commits).toEqual([])
    expect(followers[0]!.style.transform).toBe('')
    expect(target.count).toBe(0)
    controller.cancel() // 何度呼んでも安全
  })

  test('dispose(画面から消える)は、リスナーを外し、ドラッグ中なら Esc の目印だけ戻す', () => {
    const { target, controller, down, log, scheduler } = setup()
    controller.start({ type: 'move' }, down(200, 200))
    target.dispatch('pointermove', pointerEvent(1, 400, 400))
    scheduler.flush()
    controller.dispose()
    expect(target.count).toBe(0)
    expect(log.previews.at(-1)).toBeNull()
  })

  test('続けて何回ドラッグしても、リスナーが溜まらない。新しく始めたら、前のは終わる', () => {
    const { target, controller, down } = setup()
    for (let i = 0; i < 4; i++) {
      controller.start({ type: 'move' }, down(200, 200))
      target.dispatch('pointermove', pointerEvent(1, 300, 300))
      target.dispatch('pointerup', pointerEvent(1, 300, 300))
    }
    expect(target.count).toBe(0)
    controller.start({ type: 'move' }, down(200, 200))
    const n = target.count
    controller.start({ type: 'move' }, down(200, 200)) // 離しが届かなかったあとの、同じポインタの押し
    expect(target.count).toBe(n)
  })

  test('別のポインタの動き・離しは、この操作に使わない', () => {
    const { target, controller, down, log } = setup()
    controller.start({ type: 'move' }, down(200, 200))
    target.dispatch('pointermove', pointerEvent(2, 900, 900))
    target.dispatch('pointerup', pointerEvent(2, 900, 900))
    expect(log.commits).toEqual([])
    expect(controller.isActive()).toBe(true)
  })
})

describe('Esc は、1 回で、受けるのは 1 つだけ', () => {
  test('Esc でドラッグを取り消したら、同じ Esc の処理の中で、takeEscape が 1 回だけ true(ほかの動作を抜けさせる)', () => {
    const { target, controller, down } = setup()
    controller.start({ type: 'move' }, down(200, 200))
    target.dispatch('pointermove', pointerEvent(1, 400, 400))
    expect(controller.takeEscape()).toBe(false) // まだ、Esc を押していない
    target.dispatch('keydown', { key: 'Escape' })
    expect(controller.takeEscape()).toBe(true)
    expect(controller.takeEscape()).toBe(false)
  })

  test('ドラッグしていないときの Esc は、takeEscape を true にしない(メニューを閉じる・矢印の取り消しは、これまでどおり)', () => {
    const { target, controller } = setup()
    target.dispatch('keydown', { key: 'Escape' })
    expect(controller.takeEscape()).toBe(false)
  })

  test('pointercancel・blur では、true にならない', () => {
    const a = setup()
    a.controller.start({ type: 'move' }, a.down(200, 200))
    a.target.dispatch('pointercancel', pointerEvent(1, 0, 0))
    expect(a.controller.takeEscape()).toBe(false)
    const b = setup()
    b.controller.start({ type: 'move' }, b.down(200, 200))
    b.target.dispatch('blur', {})
    expect(b.controller.takeEscape()).toBe(false)
  })
})

describe('固定', () => {
  test('移動は grabbing、ハンドルはその向きのカーソル。確定してから固定し、終わったら戻す', () => {
    const a = setup()
    a.controller.start({ type: 'move' }, a.down(200, 200))
    a.target.dispatch('pointermove', pointerEvent(1, 300, 300))
    expect(a.body.style.cursor).toBe('grabbing')
    expect(a.body.style.userSelect).toBe('none')
    a.target.dispatch('pointerup', pointerEvent(1, 300, 300))
    expect(a.body.style.cursor).toBe('default')

    const b = setup()
    b.controller.start({ type: 'resize', handle: 'se' }, b.down(400, 500))
    expect(b.body.style.cursor).toBe('nwse-resize')
    b.target.dispatch('pointerup', pointerEvent(1, 400, 500))
    expect(b.body.style.cursor).toBe('default')
  })

  test('押した時点で、ポインタを捕捉する', () => {
    const { controller, down, log } = setup()
    controller.start({ type: 'move' }, down(200, 200, 7))
    expect(log.captures).toEqual([7])
  })
})

describe('大きさの変更', () => {
  test('ハンドルは、押したらすぐ始まる(確定の通知)。四角は動かさず、見た目の四角を 1 フレームに 1 回、onLive で知らせる', () => {
    const { target, controller, down, log, followers, scheduler } = setup()
    controller.start({ type: 'resize', handle: 'se' }, down(400, 500))
    expect(log.actives).toEqual([true])
    expect(log.getFollowersCalls).toBe(0)
    for (let i = 1; i <= 50; i++) target.dispatch('pointermove', pointerEvent(1, 400 + i * 4, 500 + i * 2))
    expect(scheduler.pending.size).toBe(1)
    scheduler.flush()
    expect(log.lives.length).toBe(1)
    expect(log.lives[0]).toEqual({ x: 100, y: 100, width: 500, height: 500 })
    expect(followers[0]!.style.transform).toBe('') // 移動の transform は使わない
  })

  test('離したら、離した座標の四角で確定し、見た目の四角を消す', () => {
    const { target, controller, down, log } = setup()
    controller.start({ type: 'resize', handle: 'se' }, down(400, 500))
    target.dispatch('pointermove', pointerEvent(1, 450, 520))
    target.dispatch('pointerup', pointerEvent(1, 500, 600))
    expect(log.commits).toEqual([{ x: 100, y: 100, width: 400, height: 500 }])
    expect(log.lives.at(-1)).toBeNull()
  })

  test('動かさずに離したら、確定しない', () => {
    const { target, controller, down, log } = setup()
    controller.start({ type: 'resize', handle: 'e' }, down(400, 300))
    target.dispatch('pointerup', pointerEvent(1, 400, 300))
    expect(log.commits).toEqual([])
  })

  test('遠くへ速く動かしても、最小の大きさで止まる(反転して負の大きさにならない)', () => {
    const { target, controller, down, log } = setup()
    controller.start({ type: 'resize', handle: 'se' }, down(400, 500))
    target.dispatch('pointerup', pointerEvent(1, -5000, -5000))
    const r = log.commits[0]!
    expect(r.width).toBeGreaterThan(0)
    expect(r.height).toBeGreaterThan(0)
    expect(r.x).toBe(100)
    expect(r.y).toBe(100)
  })
})
