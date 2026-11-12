import { describe, expect, test } from 'bun:test'
import {
  applyMarquee,
  boundingRect,
  itemKey,
  itemsInRect,
  itemsToMove,
  parseKey,
  pressItem,
  reconcileItemSelection,
  rectContains,
  rectFromPoints,
  rectsIntersect,
  toggleKey,
  type ItemKey,
  type Selectable,
} from './canvas-selection'

const at = (kind: Selectable['kind'], id: string, x: number, y: number, width: number, height: number): Selectable => ({
  kind,
  id,
  rect: { x, y, width, height },
})

const keys = (...items: Selectable[]) => items.map((i) => itemKey(i.kind, i.id))

describe('ItemKey(種類 + ID)', () => {
  test('種類と ID を、1 つの文字列にする。ID に : が入っていても、最初の : だけで分ける', () => {
    expect(itemKey('card', 'm1')).toBe('card:m1')
    expect(itemKey('section', 's:1')).toBe('section:s:1')
    expect(parseKey('section:s:1')).toEqual({ kind: 'section', id: 's:1' })
    expect(parseKey('note:n1')).toEqual({ kind: 'note', id: 'n1' })
  })
  test('カードとセクションが同じ ID でも、別のキーになる', () => {
    expect(itemKey('card', 'x')).not.toBe(itemKey('section', 'x'))
  })
})

describe('rectFromPoints(ドラッグの 2 点から四角)', () => {
  test('右下へドラッグ', () => {
    expect(rectFromPoints({ x: 10, y: 20 }, { x: 40, y: 70 })).toEqual({ x: 10, y: 20, width: 30, height: 50 })
  })
  test('左上へドラッグしても、正の幅・高さになる', () => {
    expect(rectFromPoints({ x: 10, y: 20 }, { x: -10, y: 0 })).toEqual({ x: -10, y: 0, width: 20, height: 20 })
  })
  test('動いていない(押しただけ)なら、幅・高さは 0', () => {
    expect(rectFromPoints({ x: 5, y: 5 }, { x: 5, y: 5 })).toEqual({ x: 5, y: 5, width: 0, height: 0 })
  })
})

describe('rectsIntersect(少しでも重なるか)', () => {
  const r = { x: 0, y: 0, width: 10, height: 10 }
  test('重なる', () => {
    expect(rectsIntersect(r, { x: 5, y: 5, width: 10, height: 10 })).toBe(true)
    expect(rectsIntersect(r, { x: -5, y: -5, width: 10, height: 10 })).toBe(true)
    expect(rectsIntersect(r, { x: 2, y: 2, width: 2, height: 2 })).toBe(true) // 内側
  })
  test('辺が触れるだけでは、重ならない', () => {
    expect(rectsIntersect(r, { x: 10, y: 0, width: 10, height: 10 })).toBe(false)
    expect(rectsIntersect(r, { x: 0, y: 10, width: 10, height: 10 })).toBe(false)
  })
  test('離れている・幅か高さが 0 の四角は、重ならない', () => {
    expect(rectsIntersect(r, { x: 20, y: 20, width: 5, height: 5 })).toBe(false)
    expect(rectsIntersect(r, { x: 2, y: 2, width: 0, height: 5 })).toBe(false)
    expect(rectsIntersect({ x: 0, y: 0, width: 0, height: 0 }, r)).toBe(false)
  })
})

describe('rectContains(完全に入るか)', () => {
  const outer = { x: 0, y: 0, width: 100, height: 100 }
  test('内側(辺の上を含む)は、入る', () => {
    expect(rectContains(outer, { x: 10, y: 10, width: 20, height: 20 })).toBe(true)
    expect(rectContains(outer, { x: 0, y: 0, width: 100, height: 100 })).toBe(true)
  })
  test('一部でもはみ出したら、入らない', () => {
    expect(rectContains(outer, { x: 90, y: 90, width: 20, height: 20 })).toBe(false)
    expect(rectContains(outer, { x: -1, y: 10, width: 20, height: 20 })).toBe(false)
  })
})

describe('itemsInRect(範囲選択)', () => {
  const items = [
    at('card', 'a', 10, 10, 100, 100),
    at('section', 's', 200, 200, 100, 100),
    at('note', 'n', 350, 10, 50, 50),
  ]
  test('触れたもの(touch)を、受け取った順に返す', () => {
    const marquee = { x: 0, y: 0, width: 60, height: 60 }
    expect(itemsInRect(items, marquee, 'touch')).toEqual(['card:a'])
    const wide = { x: 0, y: 0, width: 400, height: 400 }
    expect(itemsInRect(items, wide, 'touch')).toEqual(keys(...items))
  })
  test('完全に入ったものだけ(contain)', () => {
    expect(itemsInRect(items, { x: 0, y: 0, width: 60, height: 60 }, 'contain')).toEqual([])
    expect(itemsInRect(items, { x: 5, y: 5, width: 110, height: 110 }, 'contain')).toEqual(['card:a'])
  })
  test('既定は touch。幅・高さが 0 の範囲選択は、何も選ばない', () => {
    expect(itemsInRect(items, { x: 50, y: 50, width: 30, height: 30 })).toEqual(['card:a'])
    expect(itemsInRect(items, { x: 50, y: 50, width: 0, height: 0 })).toEqual([])
  })
})

describe('toggleKey / pressItem(押したときの選択)', () => {
  const a = itemKey('card', 'a')
  const b = itemKey('card', 'b')
  test('Shift ありは、足す/外す', () => {
    expect([...toggleKey(new Set([a]), b)]).toEqual([a, b])
    expect([...toggleKey(new Set([a, b]), a)]).toEqual([b])
  })
  test('Shift なし・未選択は、その 1 つだけを選ぶ', () => {
    expect(pressItem(new Set([a]), b, false)).toEqual({ selected: new Set([b]), collapseOnRelease: false })
  })
  test('Shift なし・選択済みは、選択を変えず、離したときに 1 つだけにする', () => {
    const r = pressItem(new Set([a, b]), a, false)
    expect([...r.selected]).toEqual([a, b])
    expect(r.collapseOnRelease).toBe(true)
  })
  test('Shift なし・選択済みでも、1 つだけなら、離しても変わらない', () => {
    expect(pressItem(new Set([a]), a, false)).toEqual({ selected: new Set([a]), collapseOnRelease: false })
  })
  test('Shift ありは、離しても 1 つにまとめない', () => {
    expect(pressItem(new Set([a, b]), a, true)).toEqual({ selected: new Set([b]), collapseOnRelease: false })
  })
  test('入力の集合は変えない(新しい集合を返す)', () => {
    const input = new Set([a])
    const r = pressItem(input, b, false)
    expect([...input]).toEqual([a])
    expect(r.selected).not.toBe(input)
  })
})

describe('applyMarquee(範囲選択の結果を、いまの選択に重ねる)', () => {
  const a = itemKey('card', 'a')
  const b = itemKey('card', 'b')
  const c = itemKey('note', 'c')
  test('Shift なしは、置き換える', () => {
    expect([...applyMarquee([a, b], [c], false)]).toEqual([c])
  })
  test('Shift ありは、足す', () => {
    expect([...applyMarquee([a, b], [b, c], true)]).toEqual([a, b, c])
  })
  test('何も触れていなければ、Shift なしは空、Shift ありはそのまま', () => {
    expect([...applyMarquee([a], [], false)]).toEqual([])
    expect([...applyMarquee([a], [], true)]).toEqual([a])
  })
})

describe('boundingRect(選択全体を囲む四角)', () => {
  test('複数の四角を囲む、いちばん小さい四角', () => {
    expect(
      boundingRect([
        { x: 10, y: 20, width: 30, height: 40 },
        { x: -5, y: 50, width: 10, height: 10 },
      ]),
    ).toEqual({ x: -5, y: 20, width: 45, height: 40 })
  })
  test('空なら null', () => {
    expect(boundingRect([])).toBeNull()
  })
})

describe('reconcileItemSelection(消えた・選べないものを外す)', () => {
  const a = itemKey('card', 'a')
  const b = itemKey('card', 'b')
  test('残っているものだけを、元の順で残す', () => {
    expect([...reconcileItemSelection(new Set([a, b]), new Set([b]))]).toEqual([b])
  })
  test('すべて消えていれば、空', () => {
    expect(reconcileItemSelection(new Set([a]), new Set()).size).toBe(0)
  })
})

describe('itemsToMove(まとめて動かす候補。次の PR で使う)', () => {
  const section: ItemKey = 'section:s1'
  test('セクションと、その所属カード(位置を持つ)は、二重に動かさないようカードを除く', () => {
    expect(
      itemsToMove([
        { kind: 'section', id: 's1' },
        { kind: 'card', id: 'a', sectionId: 's1', hasPosition: true },
        { kind: 'card', id: 'b', sectionId: 's2', hasPosition: true },
        { kind: 'card', id: 'c', sectionId: null, hasPosition: true },
        { kind: 'note', id: 'n' },
      ]),
    ).toEqual([
      { kind: 'section', id: 's1' },
      { kind: 'card', id: 'b', sectionId: 's2', hasPosition: true },
      { kind: 'card', id: 'c', sectionId: null, hasPosition: true },
      { kind: 'note', id: 'n' },
    ])
    expect(section).toBe('section:s1')
  })
  test('位置を持たないカード(自動配置)は、セクションと一緒に動かないので候補に残す', () => {
    expect(
      itemsToMove([{ kind: 'card', id: 'a', sectionId: 's1', hasPosition: false }]),
    ).toEqual([{ kind: 'card', id: 'a', sectionId: 's1', hasPosition: false }])
  })
})
