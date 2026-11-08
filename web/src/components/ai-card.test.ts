import { describe, expect, test } from 'bun:test'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { AiCard, AiCards, aiBox, aiCardSummary, aiDefaultOrigin } from './ai-card'
import { connectorPath } from '#/lib/tree-layout'
import { MemberCard } from './member-card'
import type { TreeAi, TreeMember } from '#/lib/tree'

// ツリーのメンバーの AI のカード(リーダーは右、メンバーは下。確認待ちの数は持ち主だけ)

const ai = (over: Partial<TreeAi> = {}): TreeAi => ({
  tokenId: 'k1',
  name: 'Claude Code',
  lastDraftAt: null,
  pendingCount: 0,
  pendingTaskIds: [],
  offsetX: null,
  offsetY: null,
  ...over,
})
const member = (over: Partial<TreeMember> = {}): TreeMember =>
  ({
    productMemberId: 'm1',
    userId: 'u1',
    userName: '山田',
    avatarUrl: null,
    role: 'member',
    sectionId: null,
    positionX: null,
    positionY: null,
    tasks: [],
    ais: [],
    ...over,
  }) as TreeMember

describe('aiCardSummary', () => {
  test('確認待ちがあれば件数。なければ最後の下書きの日時。下書きがなければ「下書きなし」', () => {
    expect(aiCardSummary(ai({ pendingCount: 2 }))).toBe('確認待ち 2 件')
    expect(aiCardSummary(ai({ lastDraftAt: '2030-01-02T03:04:00.000Z' }))).toContain('下書き 2030/1/2')
    expect(aiCardSummary(ai())).toBe('下書きなし')
  })
  test('他の人から見る(pendingCount が null)と、件数は出ない', () => {
    expect(aiCardSummary(ai({ pendingCount: null, lastDraftAt: null }))).toBe('下書きなし')
  })
})

describe('AiCard', () => {
  test('押せない(onOpen なし)ときは、ボタンではなく article。名前が出る', () => {
    const html = renderToStaticMarkup(createElement(AiCard, { ai: ai() }))
    expect(html).toContain('<article')
    expect(html).not.toContain('<button')
    expect(html).toContain('Claude Code')
  })
  test('onOpen を渡すと、ボタンになる', () => {
    const html = renderToStaticMarkup(createElement(AiCard, { ai: ai({ pendingCount: 1 }), onOpen: () => {} }))
    expect(html).toContain('<button')
    expect(html).toContain('確認待ち 1 件')
  })
})

describe('AiCards', () => {
  test('AI がなければ何も出ない', () => {
    expect(renderToStaticMarkup(createElement(AiCards, { ais: [], side: 'bottom' }))).toBe('')
  })
  test('確認待ちのタスクがあるときだけ押せる(ほかは表示だけ)', () => {
    const html = renderToStaticMarkup(
      createElement(AiCards, {
        ais: [ai({ tokenId: 'a', pendingCount: 1, pendingTaskIds: ['t1'] }), ai({ tokenId: 'b', name: '別の AI' })],
        side: 'bottom',
        onOpen: () => {},
      }),
    )
    expect(html.match(/<button/g)?.length).toBe(1)
    expect(html.match(/<article/g)?.length).toBe(1)
  })
})

describe('AI のカードの位置', () => {
  test('保存された、初めの置き場所からのずれが、カードの位置に使われる。なければ 0', () => {
    const moved = renderToStaticMarkup(createElement(AiCards, { ais: [ai({ offsetX: 30, offsetY: -12 })], side: 'bottom' }))
    expect(moved).toContain('translate:30px -12px')
    expect(renderToStaticMarkup(createElement(AiCards, { ais: [ai()], side: 'bottom' }))).toContain('translate:0px 0px')
  })
  test('動かせる(onMove あり)ときだけ、つかめる見た目(cursor-grab)', () => {
    const movable = renderToStaticMarkup(createElement(AiCards, { ais: [ai()], side: 'bottom', onMove: () => {} }))
    const fixed = renderToStaticMarkup(createElement(AiCards, { ais: [ai()], side: 'bottom' }))
    expect(movable).toContain('cursor-grab')
    expect(fixed).not.toContain('cursor-grab')
  })
})

describe('線(メンバーのカードと同じ: 持ち主の下の中央から、AI の上の中央まで)', () => {
  const owner = { left: 0, top: 0, width: 240, height: 100 }
  test('初めの置き場所: 下は持ち主の下(16px 空ける)、右は持ち主の右(24px 空ける)。2 枚目は 56px 下', () => {
    expect(aiDefaultOrigin('bottom', 0, 100)).toEqual({ left: 16, top: 116 })
    expect(aiDefaultOrigin('bottom', 1, 100)).toEqual({ left: 16, top: 172 })
    expect(aiDefaultOrigin('right', 0, 100)).toEqual({ left: 264, top: 12 })
  })
  test('動かしたずれは、矩形の位置に足される。大きさは変わらない', () => {
    expect(aiBox('bottom', 0, 100, 30, -10)).toEqual({ left: 46, top: 106, width: 200, height: 48 })
  })
  test('線は connectorPath(メンバーと同じ関数)で引く。動かすと、子の端だけが付いていく', () => {
    const still = connectorPath(owner, aiBox('bottom', 0, 100, 0, 0))
    const moved = connectorPath(owner, aiBox('bottom', 0, 100, 80, 40))
    // 親(持ち主の下の中央 = 120,100)から出るのは同じ
    expect(still.d.startsWith('M 120 100')).toBe(true)
    expect(moved.d.startsWith('M 120 100')).toBe(true)
    expect(still.d).not.toBe(moved.d)
    // 子の上の中央(カードの左 16 + 80 + 100 = 196、上 116 + 40 = 156)に、上向きの三角が付く
    expect(moved.arrow).toBe('191,156 201,156 196,149')
  })
  test('描画: 線(data-connector-to)は、AI ごとに 1 本。動かしたずれが反映される', () => {
    const html = renderToStaticMarkup(createElement(AiCards, { ais: [ai({ tokenId: 'k1', offsetX: 80, offsetY: 40 }), ai({ tokenId: 'k2' })], side: 'bottom', ownerHeight: 100 }))
    expect(html.match(/data-connector-to=/g)?.length).toBe(2)
    expect(html).toContain(connectorPath(owner, aiBox('bottom', 0, 100, 80, 40)).d)
  })
})

describe('MemberCard の AI', () => {
  test('メンバーの AI は、持ち主のカードの下(左 16px)に、リーダーの AI は右(左 264px)に出る', () => {
    const withAi = [ai()]
    expect(renderToStaticMarkup(createElement(MemberCard, { member: member({ ais: withAi }) }))).toContain('left:16px')
    expect(renderToStaticMarkup(createElement(MemberCard, { member: member({ role: 'leader', ais: withAi }) }))).toContain('left:264px')
  })
  test('AI がいなければ、何も足されない', () => {
    expect(renderToStaticMarkup(createElement(MemberCard, { member: member() }))).not.toContain('data-ai-card')
  })
})
