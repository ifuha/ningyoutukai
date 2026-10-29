import { describe, expect, test } from 'bun:test'
import {
  collectConnectorTargets,
  createConnectorFollower,
  type AttrTarget,
  type ConnectorTarget,
} from './connector-follow'
import { connectorPath, type Box } from './tree-layout'

function attr(): AttrTarget & { values: Record<string, string>; writes: number } {
  const values: Record<string, string> = {}
  return {
    values,
    writes: 0,
    setAttribute(name, value) {
      values[name] = value
      this.writes++
    },
  }
}

const parent: Box = { left: 200, top: 0, width: 100, height: 60 }
const boxA: Box = { left: 0, top: 200, width: 100, height: 60 }
const boxB: Box = { left: 400, top: 220, width: 100, height: 80 }

function setup() {
  const a = { path: attr(), arrow: attr() }
  const b = { path: attr(), arrow: attr() }
  const targets: ConnectorTarget[] = [
    { id: 'A', box: boxA, path: a.path, arrow: a.arrow },
    { id: 'B', box: boxB, path: b.path, arrow: b.arrow },
  ]
  return { a, b, targets }
}

const shifted = (box: Box, dx: number, dy: number): Box => ({ ...box, left: box.left + dx, top: box.top + dy })

describe('createConnectorFollower', () => {
  test('動くカードへの線の端点を、動いた分だけずらして描き直す(ほかの線は触らない)', () => {
    const { a, b, targets } = setup()
    const f = createConnectorFollower({ parentId: 'P', parent, targets, moving: new Set(['A']) })
    f.apply(30, 40)
    const expected = connectorPath(parent, shifted(boxA, 30, 40))
    expect(a.path.values.d).toBe(expected.d)
    expect(a.arrow.values.points).toBe(expected.arrow)
    expect(b.path.writes).toBe(0)
    expect(b.arrow.writes).toBe(0)
  })

  test('根元(リーダー)が動くときは、すべての線が動く', () => {
    const { a, b, targets } = setup()
    const f = createConnectorFollower({ parentId: 'P', parent, targets, moving: new Set(['P']) })
    f.apply(10, 20)
    const p = shifted(parent, 10, 20)
    expect(a.path.values.d).toBe(connectorPath(p, boxA).d)
    expect(b.path.values.d).toBe(connectorPath(p, boxB).d)
  })

  test('根元と先が両方動くとき(セクションごと動かす)は、両方ずらす', () => {
    const { a, targets } = setup()
    const f = createConnectorFollower({ parentId: 'P', parent, targets, moving: new Set(['P', 'A']) })
    f.apply(-5, 7)
    expect(a.path.values.d).toBe(connectorPath(shifted(parent, -5, 7), shifted(boxA, -5, 7)).d)
  })

  test('何度 apply しても、元の位置からの差分で決まる(誤差が積み上がらない)', () => {
    const { a, targets } = setup()
    const f = createConnectorFollower({ parentId: 'P', parent, targets, moving: new Set(['A']) })
    for (let i = 1; i <= 100; i++) f.apply(i, i)
    f.apply(30, 40)
    expect(a.path.values.d).toBe(connectorPath(parent, shifted(boxA, 30, 40)).d)
  })

  test('確定しなかったとき(finish(false))は、元の線に戻す', () => {
    const { a, targets } = setup()
    const f = createConnectorFollower({ parentId: 'P', parent, targets, moving: new Set(['A']) })
    f.apply(30, 40)
    f.finish(false)
    const original = connectorPath(parent, boxA)
    expect(a.path.values.d).toBe(original.d)
    expect(a.arrow.values.points).toBe(original.arrow)
  })

  test('確定したとき(finish(true))は、書いた値を戻さない(React が新しい位置で描く)', () => {
    const { a, targets } = setup()
    const f = createConnectorFollower({ parentId: 'P', parent, targets, moving: new Set(['A']) })
    f.apply(30, 40)
    const moved = a.path.values.d
    f.finish(true)
    expect(a.path.values.d).toBe(moved)
  })

  test('一度も動かなかったなら、finish(false) でも何も書かない', () => {
    const { a, targets } = setup()
    const f = createConnectorFollower({ parentId: 'P', parent, targets, moving: new Set(['A']) })
    f.finish(false)
    expect(a.path.writes).toBe(0)
  })

  test('動くカードに線がないとき(自動配置のカードなど)は、何も起きない', () => {
    const { a, b, targets } = setup()
    const f = createConnectorFollower({ parentId: 'P', parent, targets, moving: new Set(['Z']) })
    f.apply(10, 10)
    f.finish(false)
    expect(a.path.writes + b.path.writes).toBe(0)
  })
})

describe('collectConnectorTargets', () => {
  const root = (found: Record<string, AttrTarget>) => ({
    querySelector: (selector: string) => found[selector] ?? null,
  })

  test('線の path と矢印の polygon を、id ごとに探す', () => {
    const path = attr()
    const arrow = attr()
    const out = collectConnectorTargets(
      root({
        '[data-connector-to="A"] path': path,
        '[data-connector-to="A"] polygon': arrow,
      }),
      [{ id: 'A', box: boxA }],
    )
    expect(out).toEqual([{ id: 'A', box: boxA, path, arrow }])
  })

  test('線の要素が見つからないカード(CSS の線など)は、外す', () => {
    expect(collectConnectorTargets(root({}), [{ id: 'A', box: boxA }])).toEqual([])
  })

  test('セレクターを壊す id は、探さない', () => {
    let called = 0
    const out = collectConnectorTargets(
      { querySelector: () => (called++, attr()) },
      [{ id: 'a"] , body [x="', box: boxA }],
    )
    expect(out).toEqual([])
    expect(called).toBe(0)
  })
})
