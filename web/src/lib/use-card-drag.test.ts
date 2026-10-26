import { describe, expect, test } from 'bun:test'
import { COORD_MAX } from '#/lib/section-edit-geometry'
import type { PickableSection, Rect } from '#/lib/section-edit-geometry'
import { CARD_DRAG_IDLE, CARD_DRAG_THRESHOLD, cardDragReducer } from './use-card-drag'
import type { CardDragEffect, CardDragEvent, CardDragState } from './use-card-drag'

// DOM なしで、ドラッグの状態遷移だけを確かめる(状態機械。フックは、これを呼ぶ薄い層)

const CARD: Rect = { x: 600, y: 600, width: 236, height: 138 } // 中心は (718, 669)

// 大きいセクションの中に、小さいセクションが入っている。もう 1 つは、離れた場所
const BIG: PickableSection = { sectionId: 'big', x: 0, y: 0, width: 1000, height: 1000 }
const SMALL: PickableSection = { sectionId: 'small', x: 100, y: 100, width: 300, height: 300 }
const FAR: PickableSection = { sectionId: 'far', x: 2000, y: 0, width: 300, height: 400 }
const SECTIONS = [BIG, SMALL, FAR]

const down = (over: Partial<Extract<CardDragEvent, { type: 'down' }>> = {}): CardDragEvent => ({
  type: 'down',
  memberId: 'm1',
  pointerId: 1,
  pointerType: 'mouse',
  button: 0,
  client: { x: 1000, y: 1000 },
  rect: CARD,
  enabled: true,
  ...over,
})
type MoveLike = Extract<CardDragEvent, { type: 'move' | 'up' }>
type MoveOver = { scale?: number; pointerId?: number; sections?: readonly PickableSection[] }
// 押した位置(1000, 1000)からの、画面での差分(dx, dy)の位置へ動かす・離す
const moveLike = (type: 'move' | 'up', dx: number, dy: number, over: MoveOver): MoveLike => ({
  type,
  pointerId: over.pointerId ?? 1,
  client: { x: 1000 + dx, y: 1000 + dy },
  scale: over.scale ?? 1,
  sections: over.sections ?? SECTIONS,
})
const move = (dx: number, dy: number, over: MoveOver = {}): MoveLike => moveLike('move', dx, dy, over)
const up = (dx: number, dy: number, over: MoveOver = {}): MoveLike => moveLike('up', dx, dy, over)

// イベントを順に流し、最後の状態と、各イベントの effect を返す
function run(events: CardDragEvent[], from: CardDragState = CARD_DRAG_IDLE) {
  let state = from
  const effects: CardDragEffect[] = []
  for (const e of events) {
    const r = cardDragReducer(state, e)
    state = r.state
    effects.push(r.effect)
  }
  return { state, effects }
}
const drops = (effects: CardDragEffect[]) => effects.flatMap((e) => (e.drop ? [e.drop] : []))

describe('押す(down)', () => {
  test('押すと、pending になる。まだキャンバスには何も伝えない(パンの側もポインタを記録する)', () => {
    const r = cardDragReducer(CARD_DRAG_IDLE, down())
    expect(r.state).toEqual({
      phase: 'pending',
      memberId: 'm1',
      pointerId: 1,
      startClient: { x: 1000, y: 1000 },
      startRect: CARD,
    })
    expect(r.effect).toEqual({ consumed: false })
  })

  test('マウスの右クリック(主ボタン以外)は無視する', () => {
    expect(cardDragReducer(CARD_DRAG_IDLE, down({ button: 2 })).state).toEqual(CARD_DRAG_IDLE)
    expect(cardDragReducer(CARD_DRAG_IDLE, down({ button: 1 })).state).toEqual(CARD_DRAG_IDLE)
  })

  test('タッチとペンは、button が 0 のとき始まる', () => {
    expect(cardDragReducer(CARD_DRAG_IDLE, down({ pointerType: 'touch' })).state.phase).toBe('pending')
    expect(cardDragReducer(CARD_DRAG_IDLE, down({ pointerType: 'pen' })).state.phase).toBe('pending')
  })

  test('enabled が false(リーダーでない)なら、何もしない。キャンバスにも伝える(consumed が false)', () => {
    const r = run([down({ enabled: false }), move(50, 50), up(50, 50)])
    expect(r.state).toEqual(CARD_DRAG_IDLE)
    expect(r.effects.every((e) => !e.consumed && !e.started && !e.drop && !e.suppressClick)).toBe(true)
  })

  test('カードの位置が取れない(rect が null)なら、始めない', () => {
    expect(cardDragReducer(CARD_DRAG_IDLE, down({ rect: null })).state).toEqual(CARD_DRAG_IDLE)
  })
})

describe('クリックとドラッグの区別', () => {
  test('しきい値(4px)未満の動きは、ドラッグにならない。キャンバスにも伝える', () => {
    const r = run([down(), move(3, 0), move(0, -3), move(2, 2)])
    expect(r.state.phase).toBe('pending')
    expect(r.effects.every((e) => !e.consumed && !e.started)).toBe(true)
  })

  test('しきい値ちょうどで、ドラッグが確定する(started)。このイベントは、キャンバスに伝えない', () => {
    const r = run([down(), move(CARD_DRAG_THRESHOLD, 0)])
    expect(r.state.phase).toBe('dragging')
    expect(r.effects[1]).toEqual({ consumed: true, started: true })
  })

  test('斜めの動きは、距離(ピタゴラス)で判定する', () => {
    expect(run([down(), move(2, 2)]).state.phase).toBe('pending') // 約 2.83
    expect(run([down(), move(3, 3)]).state.phase).toBe('dragging') // 約 4.24
  })

  test('started は、確定した 1 回だけ。続く動きは started を持たない', () => {
    const r = run([down(), move(10, 0), move(20, 0), move(30, 0)])
    expect(r.effects.filter((e) => e.started).length).toBe(1)
    expect(r.effects.slice(1).every((e) => e.consumed)).toBe(true)
  })

  test('動かさずに離した(クリック)ときは、drop も click の抑止もしない。キャンバスにも伝える', () => {
    const r = run([down(), move(2, 1), up(2, 1)])
    expect(r.state).toEqual(CARD_DRAG_IDLE)
    expect(r.effects[2]).toEqual({ consumed: false })
    expect(drops(r.effects)).toEqual([])
  })

  test('一度ドラッグになったら、しきい値より内側に戻っても、ドラッグのまま', () => {
    const r = run([down(), move(50, 0), move(1, 0)])
    expect(r.state.phase).toBe('dragging')
  })
})

describe('拡大率(scale)による換算', () => {
  test('画面の差分を、拡大率で割って、キャンバスの座標にする', () => {
    const r = run([down(), move(100, 40, { scale: 2 })])
    expect(r.state).toMatchObject({ phase: 'dragging', position: { x: 650, y: 620 } })
  })

  test('縮小(scale < 1)では、差分が大きくなる', () => {
    const r = run([down(), move(10, 20, { scale: 0.5 })])
    expect(r.state).toMatchObject({ position: { x: 620, y: 640 } })
  })

  test('scale が 0・負・NaN のときは、1 として扱う(0 で割らない)', () => {
    for (const scale of [0, -2, Number.NaN, Number.POSITIVE_INFINITY]) {
      const r = run([down(), move(30, 30, { scale })])
      expect(r.state).toMatchObject({ position: { x: 630, y: 630 } })
    }
  })

  test('動かしている途中で拡大率が変わっても、いまの拡大率で、開始点からの差分を換算し直す', () => {
    const r = run([down(), move(40, 0, { scale: 1 }), move(40, 0, { scale: 2 })])
    expect(r.state).toMatchObject({ position: { x: 620, y: 600 } })
  })

  test('位置は「開始時のカードの左上 + 差分」。押した位置のずれは、位置に影響しない', () => {
    const r = run([down({ client: { x: 5, y: 5 } }), { ...move(0, 0), client: { x: 105, y: 5 } }])
    expect(r.state).toMatchObject({ position: { x: 700, y: 600 } })
  })
})

describe('位置の上限での丸め', () => {
  test('座標の上限(±1,000,000)に収める', () => {
    const r = run([down(), move(5_000_000, -5_000_000)])
    expect(r.state).toMatchObject({ position: { x: COORD_MAX, y: -COORD_MAX } })
  })

  test('drop する位置も、上限に収まっている', () => {
    const r = run([down(), move(10, 10), up(9_000_000, 9_000_000)])
    expect(drops(r.effects)[0]?.position).toEqual({ x: COORD_MAX, y: COORD_MAX })
  })

  test('開始時のカードの位置が上限に近いとき、差分で超えても丸まる', () => {
    const near: Rect = { x: COORD_MAX - 10, y: 0, width: 236, height: 138 }
    const r = run([down({ rect: near }), move(500, 0)])
    expect(r.state).toMatchObject({ position: { x: COORD_MAX, y: 0 } })
  })
})

describe('セクションへの出し入れ', () => {
  // カードの中心は (位置 + 118, 位置 + 69)。CARD の開始位置 (600, 600) の中心は (718, 669)=大きいセクションの中
  test('動かし始めの位置が大きいセクションの中なら、hoverSectionId は big', () => {
    const r = run([down(), move(10, 0)])
    expect(r.state).toMatchObject({ hoverSectionId: 'big' })
  })

  test('入れ子では、面積が小さい方(内側)を選ぶ', () => {
    // 中心を (250, 250) 付近(小さいセクションの中)に動かす: 位置は (132, 181) → 差分 (-468, -419)
    const r = run([down(), move(-468, -419)])
    expect(r.state).toMatchObject({ hoverSectionId: 'small' })
  })

  test('小さいセクションから出て、大きいセクションの中に残ると、big に変わる', () => {
    const r = run([down(), move(-468, -419), move(-100, -100)])
    expect(r.state).toMatchObject({ hoverSectionId: 'big' })
  })

  test('どのセクションにも入らない位置に動かすと、null(無所属)', () => {
    // 位置 (2100, 600)、中心 (2218, 669)。FAR は y が 0〜400 なので外、BIG は x が 1000 まで
    const r = run([down(), move(1500, 0)])
    expect(r.state).toMatchObject({ hoverSectionId: null })
  })

  test('別のセクションの中へ動かすと、そのセクションの ID になる', () => {
    // 中心を (2150, 200) へ: 位置は (2032, 131) → 差分 (1432, -469)
    const r = run([down(), move(1432, -469)])
    expect(r.state).toMatchObject({ hoverSectionId: 'far' })
  })

  test('drop では、入るセクションの ID を返す', () => {
    const r = run([down(), move(10, 0), up(1432, -469)])
    expect(drops(r.effects)).toEqual([
      { memberId: 'm1', position: { x: 2032, y: 131 }, sectionId: 'far' },
    ])
  })

  test('セクションの外へ出して離したら、sectionId は null(無所属に戻る)', () => {
    const r = run([down(), move(10, 0), up(1500, 0)])
    expect(drops(r.effects)[0]?.sectionId).toBeNull()
  })

  test('同じセクションの中で動かしたときは、そのセクションの ID を返す(所属を維持する)', () => {
    const r = run([down(), move(10, 0), up(50, 50)]) // 位置 (650, 650)。中心 (768, 719) は big の中
    expect(drops(r.effects)).toEqual([
      { memberId: 'm1', position: { x: 650, y: 650 }, sectionId: 'big' },
    ])
  })

  test('セクションが 1 つもないときは、常に null', () => {
    const r = run([down(), move(10, 0, { sections: [] }), up(50, 50, { sections: [] })])
    expect(drops(r.effects)[0]?.sectionId).toBeNull()
  })

  test('判定は、離したときのセクションの一覧で行う(動かしている間に増減してもよい)', () => {
    const r = run([down(), move(10, 0, { sections: [] }), up(50, 50, { sections: [BIG] })])
    expect(drops(r.effects)[0]?.sectionId).toBe('big')
  })

  test('辺の上(中心がちょうど辺)は、内側として扱う', () => {
    // 中心 x がちょうど big の右の辺(1000)になる位置: 位置 x = 882 → 差分 282。中心 y = 669 は中
    const r = run([down(), move(282, 0)])
    expect(r.state).toMatchObject({ hoverSectionId: 'big' })
  })
})

describe('離す(up)', () => {
  test('位置が変わっていれば、drop を 1 回だけ返し、click を抑止する。idle に戻る', () => {
    const r = run([down(), move(10, 0), move(50, 50), up(80, 90)])
    expect(drops(r.effects)).toEqual([
      { memberId: 'm1', position: { x: 680, y: 690 }, sectionId: 'big' },
    ])
    expect(r.effects[3].suppressClick).toBe(true)
    expect(r.effects[3].consumed).toBe(false) // パンの側が、ポインタの記録を片付けられるように、離しはキャンバスへ渡す
    expect(r.state).toEqual(CARD_DRAG_IDLE)
  })

  test('離したあとの、余計な up / move は、drop を増やさない(1 回だけ)', () => {
    const r = run([down(), move(10, 0), up(80, 90), up(80, 90), move(100, 100), up(100, 100)])
    expect(drops(r.effects).length).toBe(1)
  })

  test('離した位置を使う(最後の move と離した位置が違っていても、離した位置が drop になる)', () => {
    const r = run([down(), move(10, 0), up(70, 0)])
    expect(drops(r.effects)[0]?.position).toEqual({ x: 670, y: 600 })
  })

  test('ドラッグしたあと、元の位置に戻して離したときは、drop しない(click は抑止する)', () => {
    const r = run([down(), move(50, 50), up(0, 0)])
    expect(drops(r.effects)).toEqual([])
    expect(r.effects[2].suppressClick).toBe(true)
    expect(r.state).toEqual(CARD_DRAG_IDLE)
  })

  test('元の位置から 0.5 以内の差(キャンバスの座標)は、動かなかったと見なす', () => {
    expect(drops(run([down(), move(50, 50), up(0.4, 0.4)]).effects)).toEqual([])
    expect(drops(run([down(), move(50, 50), up(0.6, 0)]).effects).length).toBe(1)
  })

  test('drop の memberId は、押されたカードのもの', () => {
    const r = run([down({ memberId: 'm9' }), move(30, 0), up(60, 0)])
    expect(drops(r.effects)[0]?.memberId).toBe('m9')
  })
})

describe('取りやめ(Esc・pointercancel・無効化)', () => {
  test('ドラッグ中の Esc は、drop を返さず、ポインタが離されるまで動きを呑み込む', () => {
    const r = run([down(), move(50, 50), { type: 'escape' }, move(80, 80), move(120, 0)])
    expect(r.state).toEqual({ phase: 'aborted', pointerId: 1, confirmed: true })
    expect(r.effects[3].consumed).toBe(true) // その後の動きで、キャンバスのパンが始まらないように
    expect(drops(r.effects)).toEqual([])
  })

  test('Esc のあと離したときは、drop せず、click だけ抑止する。idle に戻る', () => {
    const r = run([down(), move(50, 50), { type: 'escape' }, up(80, 80)])
    expect(drops(r.effects)).toEqual([])
    expect(r.effects[3]).toEqual({ consumed: false, suppressClick: true })
    expect(r.state).toEqual(CARD_DRAG_IDLE)
  })

  test('pending のうちの Esc(まだドラッグが確定していない)は、click を抑止しない', () => {
    const r = run([down(), move(1, 1), { type: 'escape' }, move(80, 80), up(80, 80)])
    expect(r.state).toEqual(CARD_DRAG_IDLE)
    expect(r.effects[4]).toEqual({ consumed: false })
    expect(drops(r.effects)).toEqual([])
  })

  test('pending で Esc を押したあと、動かしても、ドラッグにならない', () => {
    const r = run([down(), { type: 'escape' }, move(100, 100)])
    expect(r.state).toEqual({ phase: 'aborted', pointerId: 1, confirmed: false })
    expect(r.effects[2].started).toBeUndefined()
  })

  test('idle での Esc は、何もしない', () => {
    expect(cardDragReducer(CARD_DRAG_IDLE, { type: 'escape' })).toEqual({
      state: CARD_DRAG_IDLE,
      effect: { consumed: false },
    })
  })

  test('pointercancel は、drop を返さず、idle に戻る', () => {
    const r = run([down(), move(50, 50), { type: 'cancel', pointerId: 1 }])
    expect(r.state).toEqual(CARD_DRAG_IDLE)
    expect(drops(r.effects)).toEqual([])
  })

  test('pending での pointercancel も、idle に戻る', () => {
    expect(run([down(), { type: 'cancel', pointerId: 1 }]).state).toEqual(CARD_DRAG_IDLE)
  })

  test('取りやめたあとの、新しい押しは、普通に始まる', () => {
    const r = run([
      down(),
      move(50, 50),
      { type: 'cancel', pointerId: 1 },
      down({ pointerId: 2 }),
      move(30, 0, { pointerId: 2 }),
    ])
    expect(r.state.phase).toBe('dragging')
  })

  test('aborted のあとの cancel も、idle に戻る(離しの代わり)', () => {
    const r = run([down(), move(50, 50), { type: 'escape' }, { type: 'cancel', pointerId: 1 }])
    expect(r.state).toEqual(CARD_DRAG_IDLE)
  })
})

describe('2 本目の指・別のポインタ', () => {
  test('pending のうちに、別のポインタが押されたら、取りやめる(ピンチに譲る)', () => {
    const r = run([down(), down({ pointerId: 2, pointerType: 'touch', memberId: 'm2' })])
    expect(r.state).toEqual(CARD_DRAG_IDLE)
    expect(r.effects[1]).toEqual({ consumed: false })
  })

  test('ドラッグ中に、別のポインタが押されても、ドラッグは変わらない。キャンバスにも渡さない(ピンチにしない)', () => {
    const r = run([down(), move(50, 0), down({ pointerId: 2, pointerType: 'touch' })])
    expect(r.state.phase).toBe('dragging')
    expect(r.effects[2]).toEqual({ consumed: true })
  })

  test('ドラッグ中の、別のポインタの move / up / cancel は、無視する(状態も位置も変わらない)', () => {
    const base = run([down(), move(50, 0)]).state
    const r = run(
      [
        move(300, 300, { pointerId: 2 }),
        up(300, 300, { pointerId: 2 }),
        { type: 'cancel', pointerId: 2 },
      ],
      base,
    )
    expect(r.state).toEqual(base)
    expect(drops(r.effects)).toEqual([])
    expect(r.effects.every((e) => !e.consumed)).toBe(true)
  })

  test('pending の間の、別のポインタの move は、ドラッグを始めない', () => {
    const r = run([down(), move(100, 100, { pointerId: 2 })])
    expect(r.state.phase).toBe('pending')
  })

  test('idle での、別のポインタの move / up / cancel は、何もしない', () => {
    const r = run([move(10, 10), up(10, 10), { type: 'cancel', pointerId: 1 }])
    expect(r.state).toEqual(CARD_DRAG_IDLE)
    expect(r.effects.every((e) => !e.consumed && !e.drop)).toBe(true)
  })

  test('同じポインタの down は、前のジェスチャーの終わりが届かなかったものとして、新しく始める(固まらない)', () => {
    // マウスの pointerId は毎回同じ。up が届かなかったあとの、次の押しで、ドラッグが再び始まること
    const stuckDragging = run([down(), move(50, 0)]).state
    expect(cardDragReducer(stuckDragging, down({ client: { x: 500, y: 500 } })).state).toMatchObject({
      phase: 'pending',
      startClient: { x: 500, y: 500 },
    })
    const stuckAborted = run([down(), move(50, 0), { type: 'escape' }]).state
    expect(cardDragReducer(stuckAborted, down()).state.phase).toBe('pending')
    const stuckPending = run([down()]).state
    expect(cardDragReducer(stuckPending, down({ client: { x: 7, y: 7 } })).state).toMatchObject({
      phase: 'pending',
      startClient: { x: 7, y: 7 },
    })
  })

  test('やり直した押しで、前のドラッグの drop は出ない(離しが届かなかったドラッグは、捨てる)', () => {
    const r = run([down(), move(50, 0), down(), up(50, 0)])
    expect(drops(r.effects)).toEqual([])
  })
})

describe('開始時のカードの大きさ', () => {
  test('入るセクションの判定には、開始時のカードの大きさ(高さが違うカード)を使う', () => {
    // 高さ 400 のカード。位置 (600, 600) の中心は (718, 800)(標準の高さ 138 なら中心 y は 669)
    const tall: Rect = { x: 600, y: 600, width: 236, height: 400 }
    // 細い帯(y が 740〜840)。中心 y が 800 + dy なので、dy = 0 なら中、dy = 100 なら外
    const narrow: PickableSection = { sectionId: 'band', x: 0, y: 740, width: 2000, height: 100 }
    const r1 = run([down({ rect: tall }), move(10, 0, { sections: [narrow] })])
    expect(r1.state).toMatchObject({ hoverSectionId: 'band' })
    const r2 = run([down({ rect: tall }), move(10, 100, { sections: [narrow] })]) // 中心 y = 900 → 外
    expect(r2.state).toMatchObject({ hoverSectionId: null })
  })
})
