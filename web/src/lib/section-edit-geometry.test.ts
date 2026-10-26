import { describe, expect, test } from 'bun:test'
import {
  CARD_SIZE,
  COORD_MAX,
  DEFAULT_SECTION_SIZE,
  MIN_SECTION_SIZE,
  SIZE_MAX,
  applyDeltaToMembers,
  clampCardPosition,
  isSameRect,
  membersInsideRect,
  moveRect,
  pickSectionForCard,
  rectDelta,
  rectFromDrag,
  rectsEqualWithin,
  resizeRect,
  type Rect,
  type ResizeHandle,
} from './section-edit-geometry'

const HANDLES: ResizeHandle[] = ['n', 's', 'e', 'w', 'ne', 'nw', 'se', 'sw']

describe('定数(api の検証と同じ値)', () => {
  test('座標・大きさの上限と、既定の大きさ', () => {
    expect(COORD_MAX).toBe(1_000_000)
    expect(SIZE_MAX).toBe(100_000)
    expect(DEFAULT_SECTION_SIZE).toEqual({ width: 300, height: 400 })
    expect(CARD_SIZE).toEqual({ width: 236, height: 138 })
    expect(MIN_SECTION_SIZE).toBe(80)
  })
})

describe('clampCardPosition', () => {
  test('範囲内はそのまま(負・小数も)', () => {
    expect(clampCardPosition({ x: -12.5, y: 300.25 })).toEqual({ x: -12.5, y: 300.25 })
    expect(clampCardPosition({ x: 0, y: 0 })).toEqual({ x: 0, y: 0 })
  })
  test('上限ちょうどはそのまま、超えたら丸める', () => {
    expect(clampCardPosition({ x: COORD_MAX, y: -COORD_MAX })).toEqual({ x: COORD_MAX, y: -COORD_MAX })
    expect(clampCardPosition({ x: COORD_MAX + 1, y: -COORD_MAX - 1 })).toEqual({ x: COORD_MAX, y: -COORD_MAX })
    expect(clampCardPosition({ x: Infinity, y: -Infinity })).toEqual({ x: COORD_MAX, y: -COORD_MAX })
  })
  test('NaN は 0', () => {
    expect(clampCardPosition({ x: NaN, y: 5 })).toEqual({ x: 0, y: 5 })
  })
})

describe('isSameRect / rectsEqualWithin / rectDelta', () => {
  const r: Rect = { x: 10, y: 20, width: 300, height: 400 }
  test('isSameRect は、4 つの値がすべて同じときだけ true', () => {
    expect(isSameRect(r, { ...r })).toBe(true)
    expect(isSameRect(r, { ...r, x: 10.0001 })).toBe(false)
    expect(isSameRect(r, { ...r, height: 399 })).toBe(false)
  })
  test('rectsEqualWithin は、どの値も epsilon 以内なら true(既定 0.5。ちょうどの差は true)', () => {
    expect(rectsEqualWithin(r, { ...r, x: 10.5 })).toBe(true)
    expect(rectsEqualWithin(r, { ...r, x: 10.6 })).toBe(false)
    expect(rectsEqualWithin(r, { ...r, width: 301 }, 1)).toBe(true)
    expect(rectsEqualWithin(r, { ...r, width: 301.1 }, 1)).toBe(false)
    expect(rectsEqualWithin(r, { ...r, y: 19.9, height: 400.4 })).toBe(true)
  })
  test('rectDelta は、位置の差分(大きさは見ない)', () => {
    expect(rectDelta(r, { ...r, x: 15, y: 10, width: 999 })).toEqual({ x: 5, y: -10 })
  })
})

describe('rectFromDrag', () => {
  const s = { x: 100, y: 200 }
  test('右下へのドラッグ: 始点が左上', () => {
    expect(rectFromDrag(s, { x: 400, y: 500 })).toEqual({ x: 100, y: 200, width: 300, height: 300 })
  })
  test('左下へのドラッグ: 正の大きさに正規化(始点が右上の角)', () => {
    expect(rectFromDrag(s, { x: -100, y: 500 })).toEqual({ x: -100, y: 200, width: 200, height: 300 })
  })
  test('右上へのドラッグ', () => {
    expect(rectFromDrag(s, { x: 400, y: 0 })).toEqual({ x: 100, y: 0, width: 300, height: 200 })
  })
  test('左上へのドラッグ', () => {
    expect(rectFromDrag(s, { x: 0, y: 0 })).toEqual({ x: 0, y: 0, width: 100, height: 200 })
  })
  test('ほぼクリックだけ(縦も横も最小に満たない): 始点を左上に、既定の大きさ 300×400', () => {
    expect(rectFromDrag(s, s)).toEqual({ x: 100, y: 200, width: 300, height: 400 })
    expect(rectFromDrag(s, { x: 130, y: 150 })).toEqual({ x: 100, y: 200, width: 300, height: 400 })
    expect(rectFromDrag(s, { x: 100 + 79, y: 200 + 79 })).toEqual({ x: 100, y: 200, ...DEFAULT_SECTION_SIZE })
  })
  test('最小ちょうど(80)の一辺があれば、クリック扱いにならない', () => {
    expect(rectFromDrag(s, { x: 180, y: 210 })).toEqual({ x: 100, y: 200, width: 80, height: 80 })
  })
  test('片方だけ最小に満たない: その辺だけを、ドラッグした向きに最小まで伸ばす(始点は動かさない)', () => {
    expect(rectFromDrag(s, { x: 600, y: 210 })).toEqual({ x: 100, y: 200, width: 500, height: 80 })
    // 上向きにドラッグしたときは、上へ伸びる(始点の y が下の辺)
    expect(rectFromDrag(s, { x: 600, y: 190 })).toEqual({ x: 100, y: 120, width: 500, height: 80 })
    // 左向き(x の差が 70 で最小に満たない → 左へ 80 まで伸びる)
    expect(rectFromDrag(s, { x: 30, y: 700 })).toEqual({ x: 20, y: 200, width: 80, height: 500 })
  })
  test('小数の座標でも、正の大きさ', () => {
    const r = rectFromDrag({ x: 0.5, y: 0.5 }, { x: 200.25, y: 300.75 })
    expect(r).toEqual({ x: 0.5, y: 0.5, width: 199.75, height: 300.25 })
  })
  test('大きさが上限(100,000)を超えるなら、上限に丸める', () => {
    const r = rectFromDrag({ x: 0, y: 0 }, { x: 500_000, y: 90_000 })
    expect(r).toEqual({ x: 0, y: 0, width: SIZE_MAX, height: 90_000 })
  })
  test('座標が上限を超えるなら、上限に丸める(結果の x・y は上限内)', () => {
    const r = rectFromDrag({ x: 5_000_000, y: -5_000_000 }, { x: 5_000_300, y: -5_000_300 })
    expect(Math.abs(r.x)).toBeLessThanOrEqual(COORD_MAX)
    expect(Math.abs(r.y)).toBeLessThanOrEqual(COORD_MAX)
    expect(r.width).toBeGreaterThan(0)
    expect(r.height).toBeGreaterThan(0)
  })
})

describe('resizeRect', () => {
  const base: Rect = { x: 100, y: 200, width: 300, height: 400 }
  const right = (r: Rect) => r.x + r.width
  const bottom = (r: Rect) => r.y + r.height

  test('東(e): 右の辺だけが動く', () => {
    expect(resizeRect(base, 'e', { x: 50, y: 999 })).toEqual({ x: 100, y: 200, width: 350, height: 400 })
  })
  test('西(w): 左の辺だけが動き、右の辺は動かない', () => {
    const r = resizeRect(base, 'w', { x: -50, y: 999 })
    expect(r).toEqual({ x: 50, y: 200, width: 350, height: 400 })
    expect(right(r)).toBe(right(base))
  })
  test('南(s): 下の辺だけが動く', () => {
    expect(resizeRect(base, 's', { x: 999, y: 30 })).toEqual({ x: 100, y: 200, width: 300, height: 430 })
  })
  test('北(n): 上の辺だけが動き、下の辺は動かない', () => {
    const r = resizeRect(base, 'n', { x: 999, y: -30 })
    expect(r).toEqual({ x: 100, y: 170, width: 300, height: 430 })
    expect(bottom(r)).toBe(bottom(base))
  })
  test('角は 2 辺を同時に動かし、反対側の角は動かない', () => {
    expect(resizeRect(base, 'se', { x: 10, y: 20 })).toEqual({ x: 100, y: 200, width: 310, height: 420 })
    const nw = resizeRect(base, 'nw', { x: -10, y: -20 })
    expect(nw).toEqual({ x: 90, y: 180, width: 310, height: 420 })
    expect([right(nw), bottom(nw)]).toEqual([right(base), bottom(base)])
    const ne = resizeRect(base, 'ne', { x: 10, y: -20 })
    expect(ne).toEqual({ x: 100, y: 180, width: 310, height: 420 })
    expect(bottom(ne)).toBe(bottom(base))
    const sw = resizeRect(base, 'sw', { x: -10, y: 20 })
    expect(sw).toEqual({ x: 90, y: 200, width: 310, height: 420 })
    expect(right(sw)).toBe(right(base))
  })
  test('縮める: 通常の縮小', () => {
    expect(resizeRect(base, 'se', { x: -100, y: -100 })).toEqual({ x: 100, y: 200, width: 200, height: 300 })
    expect(resizeRect(base, 'nw', { x: 100, y: 100 })).toEqual({ x: 200, y: 300, width: 200, height: 300 })
  })
  test.each(HANDLES)('最小の大きさ(80)で止まり、反転して負にならない(%s)', (handle) => {
    const r = resizeRect(base, handle, { x: handle.includes('w') ? 5000 : -5000, y: handle.includes('n') ? 5000 : -5000 })
    if (handle.includes('w') || handle.includes('e')) expect(r.width).toBe(MIN_SECTION_SIZE)
    else expect(r.width).toBe(base.width)
    if (handle.includes('n') || handle.includes('s')) expect(r.height).toBe(MIN_SECTION_SIZE)
    else expect(r.height).toBe(base.height)
    // 動かさない側の辺は、そのまま
    if (handle.includes('w')) expect(right(r)).toBe(right(base))
    if (handle.includes('e')) expect(r.x).toBe(base.x)
    if (handle.includes('n')) expect(bottom(r)).toBe(bottom(base))
    if (handle.includes('s')) expect(r.y).toBe(base.y)
  })
  test('最小の大きさは、options.minSize で変えられる', () => {
    expect(resizeRect(base, 'e', { x: -5000, y: 0 }, { minSize: 120 }).width).toBe(120)
    expect(resizeRect(base, 'n', { x: 0, y: 5000 }, { minSize: 150 }).height).toBe(150)
  })
  test('すでに最小より小さい四角は、縮まないが、広げられる', () => {
    const tiny: Rect = { x: 0, y: 0, width: 10, height: 10 }
    expect(resizeRect(tiny, 'se', { x: -5, y: -5 })).toEqual(tiny)
    expect(resizeRect(tiny, 'nw', { x: 5, y: 5 })).toEqual(tiny)
    expect(resizeRect(tiny, 'se', { x: 20, y: 30 })).toEqual({ x: 0, y: 0, width: 30, height: 40 })
  })
  test('大きさの上限(100,000)で止まる', () => {
    const e = resizeRect(base, 'e', { x: 1_000_000, y: 0 })
    expect(e.width).toBe(SIZE_MAX)
    expect(e.x).toBe(base.x)
    const w = resizeRect({ x: 0, y: 0, width: 300, height: 400 }, 'w', { x: -1_000_000, y: 0 })
    expect(w.width).toBe(SIZE_MAX)
    expect(right(w)).toBe(300)
    const s = resizeRect(base, 's', { x: 0, y: 1_000_000 })
    expect(s.height).toBe(SIZE_MAX)
  })
  test('座標の上限(−1,000,000)を超えて、西・北へは広がらない(反対側の辺は動かない)', () => {
    const edge: Rect = { x: -COORD_MAX + 50, y: -COORD_MAX + 50, width: 300, height: 400 }
    const r = resizeRect(edge, 'nw', { x: -10_000, y: -10_000 })
    expect(r.x).toBe(-COORD_MAX)
    expect(r.y).toBe(-COORD_MAX)
    expect(right(r)).toBe(right(edge))
    expect(bottom(r)).toBe(bottom(edge))
  })
  test('座標の上限(+1,000,000)の際にある四角を、西・北から縮めても、x・y は上限を超えない', () => {
    // x + width は上限の外(1,099,000)にある。西を内側へ大きく動かしても、x は +1,000,000 で止まる
    const edge: Rect = { x: 999_000, y: 999_000, width: 100_000, height: 100_000 }
    const r = resizeRect(edge, 'nw', { x: 5_000_000, y: 5_000_000 })
    expect(r.x).toBe(COORD_MAX)
    expect(r.y).toBe(COORD_MAX)
    expect(right(r)).toBe(right(edge))
    expect(bottom(r)).toBe(bottom(edge))
  })
  test('差分 0 なら変わらない', () => {
    for (const h of HANDLES) expect(resizeRect(base, h, { x: 0, y: 0 })).toEqual(base)
  })
  test('小数の差分でも、辺の位置が合う', () => {
    const r = resizeRect(base, 'nw', { x: 0.25, y: -0.5 })
    expect(r.x).toBeCloseTo(100.25, 9)
    expect(r.width).toBeCloseTo(299.75, 9)
    expect(r.y).toBeCloseTo(199.5, 9)
    expect(r.height).toBeCloseTo(400.5, 9)
  })
})

describe('moveRect', () => {
  const base: Rect = { x: 100, y: 200, width: 300, height: 400 }
  test('差分だけ動き、大きさは変わらない(負・小数も)', () => {
    expect(moveRect(base, { x: -150.5, y: 25 })).toEqual({ x: -50.5, y: 225, width: 300, height: 400 })
  })
  test('上限ちょうどはそのまま、超えたら上限に収める', () => {
    expect(moveRect(base, { x: COORD_MAX - 100, y: 0 }).x).toBe(COORD_MAX)
    const m = moveRect(base, { x: 5_000_000, y: -5_000_000 })
    expect(m).toEqual({ x: COORD_MAX, y: -COORD_MAX, width: 300, height: 400 })
  })
  test('上限で丸められたときの実際の差分は、rectDelta で求まる', () => {
    const m = moveRect(base, { x: 5_000_000, y: 10 })
    expect(rectDelta(base, m)).toEqual({ x: COORD_MAX - 100, y: 10 })
  })
})

describe('applyDeltaToMembers', () => {
  const members = [
    { id: 'a', positionX: 10, positionY: 20 },
    { id: 'b', positionX: null, positionY: null },
    { id: 'c', positionX: -5.5, positionY: 0 },
  ]
  test('位置を持つメンバーだけを、同じ差分だけ動かし、他のフィールドは保つ', () => {
    const r = applyDeltaToMembers(members, { x: 100, y: -20 })
    expect(r).toEqual({
      ok: true,
      members: [
        { id: 'a', positionX: 110, positionY: 0 },
        { id: 'b', positionX: null, positionY: null },
        { id: 'c', positionX: 94.5, positionY: -20 },
      ],
    })
  })
  test('位置が NULL のメンバーは NULL のまま(同じオブジェクトのまま)', () => {
    const r = applyDeltaToMembers(members, { x: 1, y: 1 })
    if (!r.ok) throw new Error('失敗しないはず')
    expect(r.members[1]).toBe(members[1]!)
  })
  test('元の配列とオブジェクトは変えない', () => {
    const before = JSON.stringify(members)
    applyDeltaToMembers(members, { x: 100, y: 100 })
    expect(JSON.stringify(members)).toBe(before)
  })
  test('差分が両方 0 なら、何も調べず成功(api と同じ。上限を超えている行があっても失敗にしない)', () => {
    const over = [{ positionX: COORD_MAX + 5, positionY: 0 }]
    expect(applyDeltaToMembers(over, { x: 0, y: 0 })).toEqual({ ok: true, members: over })
  })
  test('上限ちょうどは成功', () => {
    const edge = [{ positionX: COORD_MAX - 10, positionY: -COORD_MAX + 10 }]
    expect(applyDeltaToMembers(edge, { x: 10, y: -10 })).toEqual({
      ok: true,
      members: [{ positionX: COORD_MAX, positionY: -COORD_MAX }],
    })
  })
  test('1 人でも上限を超えるなら、全体を動かさずに失敗(x でも y でも、負の側でも)', () => {
    const list = [
      { id: 'ok', positionX: 0, positionY: 0 },
      { id: 'over', positionX: COORD_MAX - 10, positionY: 0 },
    ]
    expect(applyDeltaToMembers(list, { x: 11, y: 0 })).toEqual({ ok: false })
    expect(applyDeltaToMembers([{ positionX: 0, positionY: COORD_MAX }], { x: 0, y: 1 })).toEqual({ ok: false })
    expect(applyDeltaToMembers([{ positionX: -COORD_MAX, positionY: 0 }], { x: -1, y: 0 })).toEqual({ ok: false })
  })
  test('位置が NULL のメンバーだけなら、どんな差分でも成功', () => {
    const nulls = [{ positionX: null, positionY: null }]
    expect(applyDeltaToMembers(nulls, { x: 9e9, y: 9e9 })).toEqual({ ok: true, members: nulls })
  })
  test('メンバーがいなくても成功', () => {
    expect(applyDeltaToMembers([], { x: 5, y: 5 })).toEqual({ ok: true, members: [] })
  })
})

describe('pickSectionForCard', () => {
  const outer = { sectionId: 'outer', x: 0, y: 0, width: 1000, height: 1000 }
  const inner = { sectionId: 'inner', x: 100, y: 100, width: 300, height: 300 }
  const card = (cx: number, cy: number) => ({ x: cx - CARD_SIZE.width / 2, y: cy - CARD_SIZE.height / 2, ...CARD_SIZE })

  test('どのセクションにも入らなければ null(無所属)', () => {
    expect(pickSectionForCard(card(5000, 5000), [outer, inner])).toBeNull()
    expect(pickSectionForCard({ x: -1, y: -1 }, [outer])).toBeNull()
    expect(pickSectionForCard({ x: 0, y: 0 }, [])).toBeNull()
  })
  test('カードの中心で判定する(カードの端がはみ出していてもよい)', () => {
    expect(pickSectionForCard(card(5, 5), [outer])).toBe('outer')
    expect(pickSectionForCard(card(-5, 500), [outer])).toBeNull()
  })
  test('中心の点を直接渡せる', () => {
    expect(pickSectionForCard({ x: 500, y: 500 }, [outer])).toBe('outer')
  })
  test('辺の上は内側に含む(4 辺と角)', () => {
    expect(pickSectionForCard({ x: 0, y: 500 }, [outer])).toBe('outer')
    expect(pickSectionForCard({ x: 1000, y: 500 }, [outer])).toBe('outer')
    expect(pickSectionForCard({ x: 500, y: 0 }, [outer])).toBe('outer')
    expect(pickSectionForCard({ x: 500, y: 1000 }, [outer])).toBe('outer')
    expect(pickSectionForCard({ x: 1000, y: 1000 }, [outer])).toBe('outer')
    expect(pickSectionForCard({ x: 1000.0001, y: 500 }, [outer])).toBeNull()
  })
  test('入れ子: 内側のセクションの中なら、面積が小さい内側を選ぶ(並び順に関わらない)', () => {
    expect(pickSectionForCard(card(250, 250), [outer, inner])).toBe('inner')
    expect(pickSectionForCard(card(250, 250), [inner, outer])).toBe('inner')
  })
  test('内側の外・外側の中なら、外側', () => {
    expect(pickSectionForCard(card(700, 700), [outer, inner])).toBe('outer')
  })
  test('面積が同じ四角が重なるときは、createdAt が新しい方', () => {
    const a = { sectionId: 'a', x: 0, y: 0, width: 200, height: 200, createdAt: '2026-10-25T00:00:00.000Z' }
    const b = { sectionId: 'b', x: 50, y: 50, width: 200, height: 200, createdAt: '2026-10-26T00:00:00.000Z' }
    expect(pickSectionForCard({ x: 100, y: 100 }, [a, b])).toBe('b')
    expect(pickSectionForCard({ x: 100, y: 100 }, [b, a])).toBe('b')
    // Date でも比べられる
    expect(pickSectionForCard({ x: 100, y: 100 }, [{ ...a, createdAt: new Date('2026-10-27') }, b])).toBe('a')
  })
  test('面積が同じで createdAt が同じ・なし・不正なら、配列の後ろの方', () => {
    const a = { sectionId: 'a', x: 0, y: 0, width: 200, height: 200 }
    const b = { sectionId: 'b', x: 50, y: 50, width: 200, height: 200 }
    expect(pickSectionForCard({ x: 100, y: 100 }, [a, b])).toBe('b')
    expect(pickSectionForCard({ x: 100, y: 100 }, [b, a])).toBe('a')
    const same = '2026-10-25T00:00:00.000Z'
    expect(pickSectionForCard({ x: 100, y: 100 }, [{ ...a, createdAt: same }, { ...b, createdAt: same }])).toBe('b')
    expect(pickSectionForCard({ x: 100, y: 100 }, [{ ...a, createdAt: 'x' }, { ...b, createdAt: same }])).toBe('b')
  })
  test('面積の優先は、新しさより強い(古くても小さい方)', () => {
    const smallOld = { sectionId: 'small', x: 0, y: 0, width: 100, height: 100, createdAt: '2020-01-01T00:00:00.000Z' }
    const bigNew = { sectionId: 'big', x: 0, y: 0, width: 500, height: 500, createdAt: '2026-10-26T00:00:00.000Z' }
    expect(pickSectionForCard({ x: 50, y: 50 }, [smallOld, bigNew])).toBe('small')
  })
})

describe('membersInsideRect', () => {
  const rect: Rect = { x: 0, y: 0, width: 400, height: 400 }
  const m = (id: string, positionX: number | null, positionY: number | null) => ({ id, positionX, positionY })
  test('カードの中心(左上 + 大きさの半分)が入るメンバーだけ。順序はそのまま', () => {
    const list = [
      m('in1', 100, 100), // 中心 (218, 169)
      m('out', 500, 500),
      m('in2', 0, 0), // 中心 (118, 69)
      m('null', null, null),
    ]
    expect(membersInsideRect(list, rect, CARD_SIZE).map((x) => x.id)).toEqual(['in1', 'in2'])
  })
  test('左上がはみ出していても、中心が入っていれば含む。中心が外なら含まない', () => {
    expect(membersInsideRect([m('a', -100, -50)], rect).map((x) => x.id)).toEqual(['a']) // 中心 (18, 19)
    expect(membersInsideRect([m('b', -200, 0)], rect)).toEqual([]) // 中心 (-82, 69)
  })
  test('辺の上は含む', () => {
    // 中心がちょうど x = 400 の辺の上: positionX = 400 - 118 = 282
    expect(membersInsideRect([m('edge', 282, 100)], rect).map((x) => x.id)).toEqual(['edge'])
    expect(membersInsideRect([m('edge', 282.01, 100)], rect)).toEqual([])
  })
  test('カードの大きさを指定できる', () => {
    expect(membersInsideRect([m('a', 380, 0)], rect, { width: 40, height: 40 }).map((x) => x.id)).toEqual(['a'])
    expect(membersInsideRect([m('a', 380, 0)], rect, { width: 100, height: 40 })).toEqual([])
  })
})

// 固定のシードの乱数(mulberry32)
function rng(seed: number) {
  let a = seed
  return () => {
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

describe('性質テスト(固定シードの乱数)', () => {
  const N = 2000
  const randomRect = (rand: () => number): Rect => ({
    x: (rand() * 2 - 1) * COORD_MAX,
    y: (rand() * 2 - 1) * COORD_MAX,
    width: MIN_SECTION_SIZE + rand() * (SIZE_MAX - MIN_SECTION_SIZE),
    height: MIN_SECTION_SIZE + rand() * (SIZE_MAX - MIN_SECTION_SIZE),
  })
  // 小さい差分と、極端に大きい差分を混ぜる
  const randomDelta = (rand: () => number) => {
    const scale = [10, 1_000, 100_000, 5_000_000][Math.floor(rand() * 4)]!
    return { x: (rand() * 2 - 1) * scale, y: (rand() * 2 - 1) * scale }
  }

  test('resizeRect: 常に最小以上・上限以下の大きさで、座標は上限内、動かさない側の辺は動かない', () => {
    const rand = rng(20261026)
    for (let i = 0; i < N; i++) {
      const rect = randomRect(rand)
      const handle = HANDLES[Math.floor(rand() * HANDLES.length)]!
      const r = resizeRect(rect, handle, randomDelta(rand))
      expect(r.width).toBeGreaterThanOrEqual(MIN_SECTION_SIZE)
      expect(r.height).toBeGreaterThanOrEqual(MIN_SECTION_SIZE)
      expect(r.width).toBeLessThanOrEqual(SIZE_MAX)
      expect(r.height).toBeLessThanOrEqual(SIZE_MAX)
      expect(Math.abs(r.x)).toBeLessThanOrEqual(COORD_MAX)
      expect(Math.abs(r.y)).toBeLessThanOrEqual(COORD_MAX)
      const tol = 1e-6
      if (handle.includes('w')) expect(Math.abs(r.x + r.width - (rect.x + rect.width))).toBeLessThan(tol)
      if (handle.includes('e')) expect(r.x).toBe(rect.x)
      if (handle.includes('n')) expect(Math.abs(r.y + r.height - (rect.y + rect.height))).toBeLessThan(tol)
      if (handle.includes('s')) expect(r.y).toBe(rect.y)
      // 関係のない軸は、変わらない
      if (!handle.includes('w') && !handle.includes('e')) {
        expect(r.x).toBe(rect.x)
        expect(r.width).toBe(rect.width)
      }
      if (!handle.includes('n') && !handle.includes('s')) {
        expect(r.y).toBe(rect.y)
        expect(r.height).toBe(rect.height)
      }
    }
  })

  test('moveRect: 常に座標は上限内で、大きさは変わらない。丸められなければ差分どおり', () => {
    const rand = rng(7)
    for (let i = 0; i < N; i++) {
      const rect = randomRect(rand)
      const d = randomDelta(rand)
      const r = moveRect(rect, d)
      expect(Math.abs(r.x)).toBeLessThanOrEqual(COORD_MAX)
      expect(Math.abs(r.y)).toBeLessThanOrEqual(COORD_MAX)
      expect(r.width).toBe(rect.width)
      expect(r.height).toBe(rect.height)
      if (Math.abs(rect.x + d.x) <= COORD_MAX) expect(r.x).toBe(rect.x + d.x)
      if (Math.abs(rect.y + d.y) <= COORD_MAX) expect(r.y).toBe(rect.y + d.y)
    }
  })

  test('rectFromDrag: 常に正の大きさ(最小以上・上限以下)で、座標は上限内', () => {
    const rand = rng(99)
    for (let i = 0; i < N; i++) {
      const scale = [100, 10_000, 5_000_000][Math.floor(rand() * 3)]!
      const s = { x: (rand() * 2 - 1) * scale, y: (rand() * 2 - 1) * scale }
      const e = { x: (rand() * 2 - 1) * scale, y: (rand() * 2 - 1) * scale }
      const r = rectFromDrag(s, e)
      expect(r.width).toBeGreaterThanOrEqual(MIN_SECTION_SIZE)
      expect(r.height).toBeGreaterThanOrEqual(MIN_SECTION_SIZE)
      expect(r.width).toBeLessThanOrEqual(SIZE_MAX)
      expect(r.height).toBeLessThanOrEqual(SIZE_MAX)
      expect(Math.abs(r.x)).toBeLessThanOrEqual(COORD_MAX)
      expect(Math.abs(r.y)).toBeLessThanOrEqual(COORD_MAX)
    }
  })

  test('applyDeltaToMembers: 成功なら全員が上限内で、NULL の数は変わらない。失敗なら、動かす先に上限を超える人がいる', () => {
    const rand = rng(31337)
    for (let i = 0; i < N; i++) {
      const members = Array.from({ length: 1 + Math.floor(rand() * 5) }, () =>
        rand() < 0.3
          ? { positionX: null, positionY: null }
          : { positionX: (rand() * 2 - 1) * COORD_MAX, positionY: (rand() * 2 - 1) * COORD_MAX },
      )
      const d = randomDelta(rand)
      const r = applyDeltaToMembers(members, d)
      const wouldExceed = members.some(
        (m) =>
          m.positionX !== null &&
          m.positionY !== null &&
          (Math.abs(m.positionX + d.x) > COORD_MAX || Math.abs(m.positionY + d.y) > COORD_MAX),
      )
      if (r.ok) {
        expect(wouldExceed).toBe(false)
        expect(r.members.filter((m) => m.positionX === null).length).toBe(
          members.filter((m) => m.positionX === null).length,
        )
        for (const m of r.members) {
          if (m.positionX !== null) expect(Math.abs(m.positionX)).toBeLessThanOrEqual(COORD_MAX)
          if (m.positionY !== null) expect(Math.abs(m.positionY)).toBeLessThanOrEqual(COORD_MAX)
        }
      } else {
        expect(wouldExceed).toBe(true)
      }
    }
  })

  test('pickSectionForCard: 選ばれたセクションは、必ず中心を含み、含むものの中で面積が最小', () => {
    const rand = rng(5)
    for (let i = 0; i < N; i++) {
      const sections = Array.from({ length: 1 + Math.floor(rand() * 5) }, (_, k) => ({
        sectionId: `s${k}`,
        x: rand() * 1000,
        y: rand() * 1000,
        width: 50 + rand() * 800,
        height: 50 + rand() * 800,
      }))
      const p = { x: rand() * 1500, y: rand() * 1500 }
      const picked = pickSectionForCard(p, sections)
      const containing = sections.filter(
        (s) => p.x >= s.x && p.x <= s.x + s.width && p.y >= s.y && p.y <= s.y + s.height,
      )
      if (containing.length === 0) {
        expect(picked).toBeNull()
      } else {
        const chosen = containing.find((s) => s.sectionId === picked)
        expect(chosen).toBeDefined()
        const minArea = Math.min(...containing.map((s) => s.width * s.height))
        expect(chosen!.width * chosen!.height).toBe(minArea)
      }
    }
  })
})
