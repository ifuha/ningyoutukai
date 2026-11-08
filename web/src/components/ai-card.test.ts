import { describe, expect, test } from 'bun:test'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { AiCard, AiCards, aiCardSummary, aiConnectorPoints } from './ai-card'
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

describe('点線(持ち主のカードからカードまで)', () => {
  test('動かしていなければ、右は短い横線、下はまっすぐ下げて横へ', () => {
    expect(aiConnectorPoints('right', 0, 0, 0)).toBe('0,24 24,24')
    expect(aiConnectorPoints('bottom', 0, 0, 0)).toBe('0,-16 0,24 16,24')
  })
  test('動かすと、端がカードの左の中央に付いていく(持ち主の側の端は動かない)', () => {
    expect(aiConnectorPoints('right', 0, 100, -30)).toBe('0,24 124,-6')
    expect(aiConnectorPoints('bottom', 0, 100, 40)).toBe('0,-16 0,24 116,64')
  })
  test('下に並べた 2 枚目は、持ち主のカードの下の縁まで、1 枚分(48 + 8)長く上へ伸びる', () => {
    expect(aiConnectorPoints('bottom', 1, 0, 0)).toBe('0,-72 0,24 16,24')
  })
  test('描画: 点線(polyline)は、動かしたずれを反映して引かれる', () => {
    const html = renderToStaticMarkup(createElement(AiCards, { ais: [ai({ offsetX: 10, offsetY: 5 })], side: 'right' }))
    expect(html).toContain('points="0,24 34,29"')
  })
})

describe('MemberCard の AI', () => {
  test('メンバーの AI は、カードの下に出る(top-full)。リーダーの AI は右(left-full)', () => {
    const withAi = [ai()]
    expect(renderToStaticMarkup(createElement(MemberCard, { member: member({ ais: withAi }) }))).toContain('top-full')
    expect(renderToStaticMarkup(createElement(MemberCard, { member: member({ role: 'leader', ais: withAi }) }))).toContain('left-full')
  })
  test('AI がいなければ、何も足されない', () => {
    expect(renderToStaticMarkup(createElement(MemberCard, { member: member() }))).not.toContain('data-ai-card')
  })
})
