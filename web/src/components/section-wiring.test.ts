import { describe, expect, test } from 'bun:test'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { CardGhost, DragSlot } from './member-card-drag'
import { ProductTree } from './product-tree'
import { SectionLayer } from './section-layer'
import type { SectionActions } from '#/lib/use-section-actions'
import { NO_SECTION_ACTIONS } from '#/lib/use-section-actions'
import { useSectionInteraction } from '#/lib/use-section-interaction'

// 第 2 段階の部品(A: 置く層、B: 編集枠、C: カードのドラッグ)を、ツリーの画面につないだところのテスト(DOM なし。サーバーでの出力と、
// つなぎ役のフックが渡す値を検査する)。ブラウザでの実際のポインタ操作は、ここでは確かめられない(部品ごとの状態機械のテストが守る)

type Pos = { positionX: number | null; positionY: number | null }
const none: Pos = { positionX: null, positionY: null }
const member = (id: string, name: string, role: 'leader' | 'member', pos: Pos = none) => ({
  productMemberId: id,
  userId: `u-${id}`,
  userName: name,
  avatarUrl: null,
  role,
  sectionId: null,
  tasks: [],
  ...pos,
})
const L = member('L', 'リーダーA', 'leader')
const M1 = member('M1', 'メンバーB', 'member')
const M2 = member('M2', 'メンバーC', 'member', { positionX: 400, positionY: 300 })

const tree = (leader: ReturnType<typeof member>, members: ReturnType<typeof member>[]) =>
  ({
    product: { productId: 'p1', productName: 'デモ' },
    viewerProductMemberId: leader.productMemberId,
    leader,
    members,
  }) as never

const section = (over: Record<string, unknown> = {}) => ({
  sectionId: 's1',
  sectionName: '設計チーム',
  color: 'red',
  x: 0,
  y: 0,
  width: 300,
  height: 400,
  createdAt: '2026-10-26T00:00:00.000Z',
  memberIds: [],
  ...over,
})

const render = (props: Record<string, unknown>) =>
  renderToStaticMarkup(createElement(ProductTree, props as never))

describe('ProductTree(リーダーのとき: B の編集枠と、C のカードのドラッグがつながる)', () => {
  const html = render({
    tree: tree(L, [M1, M2]),
    sections: [section(), section({ sectionId: 's2', sectionName: '開発', color: 'blue', x: 500 })],
    canEditSections: true,
  })
  test('セクションごとに編集枠(B)が出て、data-no-deselect の層に入る(中のクリックで選択が外れない)', () => {
    expect(html.match(/data-section-editor=/g)?.length).toBe(2)
    expect(html).toContain('data-no-deselect')
    // 編集枠は、data-no-deselect の層の中にある
    const wrapper = html.indexOf('data-no-deselect')
    expect(html.indexOf('data-section-editor=')).toBeGreaterThan(wrapper)
  })
  test('すべてのカード(自動配置・位置を持つカード)が、touch-action: none のラッパーに包まれる', () => {
    expect(html.match(/data-drag-slot/g)?.length).toBe(3) // リーダー、メンバー B(自動配置)、メンバー C(位置あり)
    expect(html.match(/touch-none/g)?.length).toBeGreaterThanOrEqual(3)
  })
  test('編集枠は、位置を持つカードより後(上)に出力され、セクションの四角は先(下)に出力される', () => {
    const box = html.indexOf('data-section-id="s1"')
    const placedCard = html.indexOf('メンバーC')
    const editor = html.indexOf('data-section-editor="s1"')
    expect(box).toBeGreaterThan(-1)
    expect(box).toBeLessThan(placedCard)
    expect(editor).toBeGreaterThan(placedCard)
  })
  test('ドラッグしていないときは、影のカードも、薄いカードも、ハイライトも出ない', () => {
    expect(html).not.toContain('data-card-ghost')
    // 薄くするのは、ラッパー(data-drag-slot)だけ。ツールバーの無効ボタンの disabled:opacity-40 とは区別する
    expect(html).not.toMatch(/data-drag-slot="" class="touch-none opacity-40"/)
    expect(html).not.toContain('data-highlighted')
  })
  test('描く層(A)は、道具が「セクション」でないときは、何も出さない', () => {
    expect(html).not.toContain('cursor-crosshair')
  })
})

describe('ProductTree(リーダーでないとき: A・B・C は、何も出さず、何も奪わない)', () => {
  const html = render({ tree: tree(L, [M1, M2]), sections: [section()] })
  test('編集枠も、カードのドラッグのラッパーも、影も無い(これまでと同じ DOM)', () => {
    expect(html).not.toContain('data-section-editor')
    expect(html).not.toContain('data-no-deselect')
    expect(html).not.toContain('data-drag-slot')
    expect(html).not.toContain('data-card-ghost')
    expect(html).not.toContain('touch-none"><article') // カードがラッパーに包まれていない
  })
  test('セクションの四角と、カードは、これまでどおり出る', () => {
    expect(html).toContain('data-section-id="s1"')
    expect(html).toContain('メンバーB')
    expect(html).toContain('メンバーC')
  })
  test('canEditSections が false でも、編集の関数(sectionActions)を渡しても、編集枠は出ない', () => {
    const withActions = render({
      tree: tree(L, [M1]),
      sections: [section()],
      sectionActions: NO_SECTION_ACTIONS,
      canEditSections: false,
    })
    expect(withActions).not.toContain('data-section-editor')
  })
})

describe('DragSlot(カードを包む要素)', () => {
  const handlers = {
    onPointerDown: () => {},
    onPointerMove: () => {},
    onPointerUp: () => {},
    onPointerCancel: () => {},
  }
  const slot = (props: Record<string, unknown>) =>
    renderToStaticMarkup(createElement(DragSlot, { dragging: false, ...props } as never, createElement('p', null, 'カード')))
  test('ハンドラがあれば、touch-action: none のラッパーで包む', () => {
    const html = slot({ handlers })
    expect(html).toContain('data-drag-slot')
    expect(html).toContain('touch-none')
    expect(html).toContain('カード')
  })
  test('ドラッグ中は、元のカードを薄くする。そうでなければ薄くしない', () => {
    expect(slot({ handlers, dragging: true })).toContain('opacity-40')
    expect(slot({ handlers, dragging: false })).not.toContain('opacity-40')
  })
  test('ハンドラがなければ、何も包まない(子だけが出る)', () => {
    expect(slot({ handlers: undefined })).toBe('<p>カード</p>')
  })
})

describe('CardGhost(ドラッグ中のカードの影)', () => {
  const html = renderToStaticMarkup(
    createElement(CardGhost, { member: M1 as never, position: { x: 120, y: 80 }, offsetX: 30, offsetY: 10 }),
  )
  test('プレビューの位置(左上)に、負の座標のずらし量を足して置く', () => {
    expect(html).toContain('left:150px')
    expect(html).toContain('top:90px')
  })
  test('ポインタを通し、描く層・編集枠の上(z-40)に出す。測る目印(data-card-id)は付けない', () => {
    expect(html).toContain('pointer-events-none')
    expect(html).toContain('z-40')
    expect(html).not.toContain('data-card-id')
    expect(html).toContain('メンバーB')
  })
})

describe('SectionLayer(選択とドロップ先の見た目)', () => {
  const sections = [section(), section({ sectionId: 's2', sectionName: '開発', color: 'blue' })] as never
  const layer = (props: Record<string, unknown>) =>
    renderToStaticMarkup(
      createElement(SectionLayer, { sections, selectedSectionId: null, hoverSectionId: null, ...props } as never),
    )
  test('ドロップ先(hoverSectionId)のセクションだけが、強調される', () => {
    const html = layer({ hoverSectionId: 's2' })
    expect(html.match(/data-highlighted/g)?.length).toBe(1)
    expect(html.indexOf('data-highlighted')).toBeGreaterThan(html.indexOf('data-section-id="s2"'))
  })
  test('選択中のセクションだけが、選択の見た目になる', () => {
    const html = layer({ selectedSectionId: 's1' })
    expect(html.match(/data-selected/g)?.length).toBe(1)
    expect(html.indexOf('data-selected')).toBeLessThan(html.indexOf('data-section-id="s2"'))
  })
  test('どちらも無ければ、強調も選択もない', () => {
    const html = layer({})
    expect(html).not.toContain('data-highlighted')
    expect(html).not.toContain('data-selected')
  })
})

// つなぎ役のフックが、A・B・C に渡す値(フックは、描画の中で呼んで、返り値を取り出す)
describe('useSectionInteraction(A・B・C に渡す値)', () => {
  type Calls = { moves: unknown[][]; updates: unknown[][]; creates: unknown[][]; deletes: unknown[][] }
  const stub = (): { actions: SectionActions; calls: Calls } => {
    const calls: Calls = { moves: [], updates: [], creates: [], deletes: [] }
    const actions: SectionActions = {
      ...NO_SECTION_ACTIONS,
      moveMember: async (...a) => (calls.moves.push(a), true),
      updateSection: async (...a) => (calls.updates.push(a), true),
      createSection: (...a) => (calls.creates.push(a), new Promise(() => {})), // 終わらない(状態の更新を起こさない)
      deleteSection: async (...a) => (calls.deletes.push(a), true),
    }
    return { actions, calls }
  }
  const sections = [section()] as never
  const probe = (canEdit: boolean) => {
    const { actions, calls } = stub()
    let captured: ReturnType<typeof useSectionInteraction> | undefined
    const Probe = () => {
      captured = useSectionInteraction({
        actions,
        canEdit,
        sections,
        scale: 1,
        toCanvas: (p) => p,
        getCardRect: () => null,
      })
      return null
    }
    renderToStaticMarkup(createElement(Probe))
    return { api: captured!, calls }
  }

  test('リーダーでなければ、描く層・カードのドラッグ・編集枠は、すべて無効', () => {
    const { api } = probe(false)
    expect(api.drawLayerProps.active).toBe(false)
    expect(api.cardDragOptions.enabled).toBe(false)
    expect(api.editorPropsFor(sections[0]).canEdit).toBe(false)
  })
  test('リーダーなら、カードのドラッグと編集枠は有効。描く層は、道具が「セクション」になるまで無効(初期は「移動」)', () => {
    const { api } = probe(true)
    expect(api.tool).toBe('pan')
    expect(api.drawLayerProps.active).toBe(false)
    expect(api.cardDragOptions.enabled).toBe(true)
    expect(api.editorPropsFor(sections[0]).canEdit).toBe(true)
  })
  test('カードを置いた先の所属は、そのまま moveMember に渡る(null=無所属、文字列=そのセクション。取り違えない)', () => {
    const { api, calls } = probe(true)
    api.cardDragOptions.onDrop('M1', { x: 10, y: 20 }, 's1')
    api.cardDragOptions.onDrop('M1', { x: 30, y: 40 }, null)
    expect(calls.moves).toEqual([
      ['M1', { x: 10, y: 20 }, 's1'],
      ['M1', { x: 30, y: 40 }, null],
    ])
  })
  test('編集枠の確定(位置・大きさ)は、そのまま updateSection に 1 回だけ渡る(連動は、楽観更新の側で 1 回だけ)', () => {
    const { api, calls } = probe(true)
    const rect = { x: 50, y: 60, width: 320, height: 410 }
    api.editorPropsFor(sections[0]).onChange(rect)
    expect(calls.updates).toEqual([['s1', rect]])
  })
  test('名前・色の変更は、それぞれ該当のキーだけを updateSection に渡す', () => {
    const { api, calls } = probe(true)
    api.editorPropsFor(sections[0]).onRename('新しい名前')
    api.editorPropsFor(sections[0]).onColorChange('green')
    expect(calls.updates).toEqual([
      ['s1', { sectionName: '新しい名前' }],
      ['s1', { color: 'green' }],
    ])
  })
  test('置いた四角は、そのまま createSection に渡る', () => {
    const { api, calls } = probe(true)
    const rect = { x: 5, y: 6, width: 300, height: 400 }
    api.drawLayerProps.onCreate(rect)
    expect(calls.creates).toEqual([[rect]])
  })
  test('編集枠の onPreview(ドラッグ・矢印キーの途中)と、カードのドラッグの目印を渡せる(Esc の優先順位に使う)', () => {
    const { api } = probe(true)
    const props = api.editorPropsFor(sections[0])
    expect(typeof props.onPreview).toBe('function')
    expect(() => {
      props.onPreview({ x: 0, y: 0, width: 10, height: 10 })
      props.onPreview(null)
      api.setCardDragging(true)
      api.setCardDragging(false)
    }).not.toThrow()
  })
})
