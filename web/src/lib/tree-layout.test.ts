import { describe, expect, test } from 'bun:test'
import {
  ARROW_HEIGHT,
  CARD_HEIGHT_ESTIMATE,
  CARD_WIDTH,
  CONNECTOR_MIN_GAP,
  canvasBounds,
  cardRect,
  connectorKind,
  connectorPath,
  connectorSide,
  hasPosition,
  splitByPosition,
} from './tree-layout'

const m = (id: string, x: number | null, y: number | null) => ({
  id,
  positionX: x,
  positionY: y,
})

describe('hasPosition', () => {
  test('両方の値があるときだけ、位置を持つ', () => {
    expect(hasPosition(m('a', 10, 20))).toBe(true)
    expect(hasPosition(m('a', 0, 0))).toBe(true)
    expect(hasPosition(m('a', -5, 3.5))).toBe(true)
  })
  test('どちらかが NULL なら、持たない(両方 NULL は、自動配置)', () => {
    expect(hasPosition(m('a', null, null))).toBe(false)
    expect(hasPosition(m('a', 10, null))).toBe(false)
    expect(hasPosition(m('a', null, 20))).toBe(false)
  })
  test('有限でない値は、持たない扱い', () => {
    expect(hasPosition(m('a', Number.NaN, 1))).toBe(false)
    expect(hasPosition(m('a', 1, Number.POSITIVE_INFINITY))).toBe(false)
  })
})

describe('splitByPosition', () => {
  test('位置が NULL のカードは、自動配置のまま(順番を保つ)', () => {
    const { flow, placed } = splitByPosition([
      m('a', null, null),
      m('b', null, null),
      m('c', null, null),
    ])
    expect(flow.map((x) => x.id)).toEqual(['a', 'b', 'c'])
    expect(placed).toEqual([])
  })
  test('値のあるカードは、その座標に置く', () => {
    const { flow, placed } = splitByPosition([m('a', 100, 200), m('b', -10, 0)])
    expect(flow).toEqual([])
    expect(placed.map((p) => [p.member.id, p.x, p.y])).toEqual([
      ['a', 100, 200],
      ['b', -10, 0],
    ])
  })
  test('混在しても、それぞれの並びを保って分かれる', () => {
    const { flow, placed } = splitByPosition([
      m('a', null, null),
      m('b', 5, 6),
      m('c', null, null),
      m('d', 7, 8),
    ])
    expect(flow.map((x) => x.id)).toEqual(['a', 'c'])
    expect(placed.map((p) => p.member.id)).toEqual(['b', 'd'])
  })
  test('片方だけ値があるものは、自動配置に残す(崩れない)', () => {
    const { flow, placed } = splitByPosition([m('a', 1, null), m('b', null, 2)])
    expect(flow.map((x) => x.id)).toEqual(['a', 'b'])
    expect(placed).toEqual([])
  })
  test('空でも動く', () => {
    expect(splitByPosition([])).toEqual({ flow: [], placed: [] })
  })
})

describe('cardRect(座標は、カードの左上)', () => {
  test('(x, y) は左上で、右へ幅(240)、下へ高さの目安に広がる(中心ではない)', () => {
    expect(cardRect(100, 50)).toEqual({
      x: 100,
      y: 50,
      width: CARD_WIDTH,
      height: CARD_HEIGHT_ESTIMATE,
    })
    expect(CARD_WIDTH).toBe(240) // member-card.tsx の w-[240px](Figma の 236 ではなく、実寸)
  })
  test('原点(0, 0)のカードは、原点から右下へ広がる(左上に置く。ずらさない)', () => {
    const b = canvasBounds({ sections: [], cards: [{ x: 0, y: 0 }] })
    expect(b.offsetX).toBe(0)
    expect(b.offsetY).toBe(0)
    expect(b.minWidth).toBe(CARD_WIDTH)
    expect(b.minHeight).toBe(CARD_HEIGHT_ESTIMATE)
  })
  test('負の座標のカードは、左上の座標の分だけ(中心の分を足さず)全体をずらす', () => {
    const b = canvasBounds({ sections: [], cards: [{ x: -100, y: -50 }] })
    // 中心の座標なら、ずらす量は 100 + 120 になる。左上なので 100 と 50
    expect(b.offsetX).toBe(100)
    expect(b.offsetY).toBe(50)
    // ずらしたあと、左上は (0, 0)。右端は -100 + 240 + 100 = 240(原点 0 より右の範囲は、カードの右端まで)
    expect(b.minWidth).toBe(CARD_WIDTH)
    expect(b.minHeight).toBe(CARD_HEIGHT_ESTIMATE)
  })
})

describe('canvasBounds', () => {
  test('セクションも、位置を持つカードも無ければ、すべて 0(これまでの自動配置のまま)', () => {
    expect(canvasBounds({ sections: [], cards: [] })).toEqual({
      offsetX: 0,
      offsetY: 0,
      minWidth: 0,
      minHeight: 0,
    })
  })
  test('セクションが収まる大きさを、最小の大きさにする', () => {
    const b = canvasBounds({
      sections: [{ x: 100, y: 50, width: 300, height: 400 }],
      cards: [],
    })
    // 原点(自動配置の左上)から、セクションの右下まで
    expect(b).toEqual({ offsetX: 0, offsetY: 0, minWidth: 400, minHeight: 450 })
  })
  test('位置を持つカードは、幅 240 と高さの目安で数える', () => {
    const b = canvasBounds({ sections: [], cards: [{ x: 500, y: 600 }] })
    expect(b.minWidth).toBe(500 + CARD_WIDTH)
    expect(b.minHeight).toBe(600 + CARD_HEIGHT_ESTIMATE)
  })
  test('負の座標があるときは、その分だけ全体を右下へずらす', () => {
    const b = canvasBounds({
      sections: [{ x: -100, y: -30, width: 300, height: 400 }],
      cards: [{ x: -20, y: 10 }],
    })
    expect(b.offsetX).toBe(100)
    expect(b.offsetY).toBe(30)
    // ずらしたあとの範囲: 左端は -100 → 0。右端は、セクションが 200、カードが -20 + 240 = 220 で、広いほうの 220 → 320
    // 上端は -30 → 0。下端は、セクションが 370、カードが 10 + 240 = 250 で、広いほうの 370 → 400
    expect(b.minWidth).toBe(320)
    expect(b.minHeight).toBe(400)
  })
  test('原点(自動配置の左上)は、いつも範囲に含む(正の座標だけでも、左上まで広げる)', () => {
    const b = canvasBounds({
      sections: [{ x: 1000, y: 1000, width: 10, height: 10 }],
      cards: [],
    })
    expect(b.offsetX).toBe(0)
    expect(b.minWidth).toBe(1010)
  })
  test('有限でない値は、無視する(崩れない)', () => {
    const b = canvasBounds({
      sections: [{ x: Number.NaN, y: 0, width: 10, height: 10 }],
      cards: [{ x: Number.POSITIVE_INFINITY, y: 0 }],
    })
    expect(b).toEqual({ offsetX: 0, offsetY: 0, minWidth: 0, minHeight: 0 })
  })
})

describe('connectorKind', () => {
  test('リーダーもメンバーも自動配置のときだけ、これまでの CSS の線', () => {
    expect(connectorKind(false, false)).toBe('css')
  })
  test('どちらかが位置を持つときは、実際の位置に合わせて SVG', () => {
    expect(connectorKind(false, true)).toBe('svg')
    expect(connectorKind(true, false)).toBe('svg')
    expect(connectorKind(true, true)).toBe('svg')
  })
})

describe('connectorPath(線の出る辺は、子の位置で変わる)', () => {
  const parent = { left: 100, top: 0, width: 240, height: 150 }
  const child = (left: number, top: number) => ({ left, top, width: 240, height: 100 })

  test('どの辺から出るか: 下 > 上 > 右 > 左 の順。重なっていれば null(線を出さない)', () => {
    expect(connectorSide(parent, child(400, 300))).toBe('bottom')
    expect(connectorSide(parent, child(400, -300))).toBe('top')
    expect(connectorSide(parent, child(400, 100))).toBe('right')
    expect(connectorSide(parent, child(-300, 100))).toBe('left')
    expect(connectorSide(parent, child(200, 100))).toBeNull()
    // 隙間が足りない(三角を描けない)向きには、出さない
    expect(connectorSide(parent, child(400, 150 + CONNECTOR_MIN_GAP))).toBe('bottom')
    expect(connectorSide(parent, child(400, 150 + CONNECTOR_MIN_GAP - 1))).toBe('right')
  })
  test('下: 親の下の中央から、中間の高さで横へ曲がり、子の上の中央へ。三角は上向き', () => {
    const { d, arrow } = connectorPath(parent, child(400, 300))
    expect(d).toBe(`M 220 150 V 225 H 520 V ${300 - ARROW_HEIGHT}`)
    expect(arrow).toBe(`515,300 525,300 520,${300 - ARROW_HEIGHT}`)
  })
  test('子が真下にあるとき、横には曲がらない(同じ x)', () => {
    expect(connectorPath(parent, child(100, 300)).d).toBe(`M 220 150 V 225 H 220 V ${300 - ARROW_HEIGHT}`)
  })
  test('上: 親の上の中央から、子の下の中央へ。三角は下向き(子から親へ)', () => {
    const { d, arrow } = connectorPath(parent, child(400, -300))
    // 親の上の中央 = (220, 0)、子の下の中央 = (520, -200)、中間 = -100
    expect(d).toBe(`M 220 0 V -100 H 520 V ${-200 + ARROW_HEIGHT}`)
    expect(arrow).toBe(`515,-200 525,-200 520,${-200 + ARROW_HEIGHT}`)
  })
  test('右: 親の右の中央から、子の左の中央へ。三角は左向き', () => {
    const { d, arrow } = connectorPath(parent, child(400, 100))
    // 親の右の中央 = (340, 75)、子の左の中央 = (400, 150)、中間 = 370
    expect(d).toBe(`M 340 75 H 370 V 150 H ${400 - ARROW_HEIGHT}`)
    expect(arrow).toBe(`400,145 400,155 ${400 - ARROW_HEIGHT},150`)
  })
  test('左: 親の左の中央から、子の右の中央へ。三角は右向き', () => {
    const { d, arrow } = connectorPath(parent, child(-300, 100))
    // 親の左の中央 = (100, 75)、子の右の中央 = (-60, 150)、中間 = 20
    expect(d).toBe(`M 100 75 H 20 V 150 H ${-60 + ARROW_HEIGHT}`)
    expect(arrow).toBe(`-60,145 -60,155 ${-60 + ARROW_HEIGHT},150`)
  })
  test('重なっているとき・近すぎて三角を描けないときは、線も三角も出さない(空)', () => {
    expect(connectorPath(parent, child(200, 100))).toEqual({ d: '', arrow: '' })
    // 真下にあるが、隙間が足りない(横にも並んでいない)
    expect(connectorPath(parent, child(100, 150 + CONNECTOR_MIN_GAP - 1))).toEqual({ d: '', arrow: '' })
    expect(connectorPath(parent, child(100, 150 + CONNECTOR_MIN_GAP)).d).not.toBe('')
  })
  test('親が負の座標側にあっても、数値のまま組み立てる', () => {
    const { d } = connectorPath({ left: -50, top: -20, width: 100, height: 40 }, { left: 0, top: 100, width: 100, height: 40 })
    expect(d).toBe(`M 0 20 V 60 H 50 V ${100 - ARROW_HEIGHT}`)
  })
})
