import { describe, expect, test } from 'bun:test'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { AI_ACTIVE_MS, AiCard, AiCards, aiCardSummary, aiWorking } from './ai-card'
import { aiBox } from '#/lib/ai-connector'
import { connectorPath } from '#/lib/tree-layout'
import { MemberCard } from './member-card'
import type { TreeAi, TreeMember } from '#/lib/tree'

// ツリーのメンバーの AI のカード(リーダーは右、メンバーは下。確認待ちの数は持ち主だけ)

const ai = (over: Partial<TreeAi> = {}): TreeAi => ({
  tokenId: 'k1',
  name: 'Claude Code',
  mine: false,
  lastDraftAt: null,
  pendingCount: 0,
  lastUsedAt: null,
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

describe('動作中の印(文書の編集中と同じ緑の点)', () => {
  const NOW = Date.parse('2030-01-01T12:00:00.000Z')
  const usedAgo = (ms: number) => ai({ lastUsedAt: new Date(NOW - ms).toISOString() })
  test('最後に使われてから 10 分未満なら動作中。10 分ちょうど・使われていない・読めない日時は、動作中ではない', () => {
    expect(aiWorking(usedAgo(0), NOW)).toBe(true)
    expect(aiWorking(usedAgo(AI_ACTIVE_MS - 1), NOW)).toBe(true)
    expect(aiWorking(usedAgo(AI_ACTIVE_MS), NOW)).toBe(false)
    expect(aiWorking(ai({ lastUsedAt: null }), NOW)).toBe(false)
    expect(aiWorking(ai({ lastUsedAt: 'x' }), NOW)).toBe(false)
  })
  test('動作中は、緑の点と「動作中」。確認待ちがあれば、点は出したまま、件数を優先する', () => {
    const working = renderToStaticMarkup(createElement(AiCard, { ai: usedAgo(60_000), now: NOW }))
    expect(working).toContain('data-working')
    expect(working).toContain('動作中')
    const waiting = renderToStaticMarkup(createElement(AiCard, { ai: { ...usedAgo(60_000), pendingCount: 1, pendingTaskIds: ['t1'] }, now: NOW }))
    expect(waiting).toContain('data-working')
    expect(waiting).toContain('確認待ち 1 件')
    expect(waiting).not.toContain('動作中')
  })
  test('動作中でなければ、点は出ない', () => {
    const idle = renderToStaticMarkup(createElement(AiCard, { ai: usedAgo(AI_ACTIVE_MS + 1), now: NOW }))
    expect(idle).not.toContain('data-working')
    expect(idle).toContain('下書きなし')
  })
})

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

describe('線の描画(メンバーのカードと同じ: 持ち主の下の中央から、AI の上の中央まで)', () => {
  const owner = { left: 0, top: 0, width: 240, height: 100 }
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

describe('トークンの取り消し(自分のトークンのカードだけ)', () => {
  test('onRevoke を渡さなければ、取り消しのボタンは出ない', () => {
    const html = renderToStaticMarkup(createElement(AiCards, { ais: [ai({ mine: true })], side: 'bottom' }))
    expect(html).not.toContain('のトークンを取り消す')
  })
  test('自分のトークン(mine)のカードにだけ出る。他の人のカードには出ない', () => {
    const html = renderToStaticMarkup(createElement(AiCards, { ais: [ai({ tokenId: 'a', mine: true }), ai({ tokenId: 'b', mine: false })], side: 'bottom', onRevoke: () => {} }))
    // ボタンのラベル(aria-label)が付くのは 1 枚だけ
    expect(html.match(/aria-label="この AI のトークンを取り消す"/g)?.length).toBe(1)
  })
  test('カードが押せる(onOpen)ときも、ボタンは入れ子にならない(取り消しは、カードの外に並ぶ)', () => {
    const html = renderToStaticMarkup(createElement(AiCard, { ai: ai({ mine: true, pendingCount: 1 }), onOpen: () => {}, onRevoke: () => {} }))
    expect(html.match(/<button/g)?.length).toBe(2)
    expect(html).not.toMatch(/<button[^>]*>(?:(?!<\/button>).)*<button/s)
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
