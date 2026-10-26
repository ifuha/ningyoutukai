import { describe, expect, test } from 'bun:test'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { ProductTree } from './product-tree'
import { TreeToolbar } from './tree-toolbar'

// 画面部品の、最小のスモークテスト(DOM なし。サーバーでのマークアップを検査する)
// ブラウザでの測定(カードの実際の位置・高さ)と、SVG の線は、ここでは出ない(`tree-layout.test.ts` と `use-card-boxes.test.ts` で、計算を確かめる)
//   ここで確かめるのは: セクションの四角、位置を持つカードの置き場所、位置が NULL のカードの自動配置のまま、道具のバー

type Pos = { positionX: number | null; positionY: number | null }
const member = (id: string, name: string, role: 'leader' | 'member', pos: Pos = { positionX: null, positionY: null }) => ({
  productMemberId: id,
  userId: `u-${id}`,
  userName: name,
  avatarUrl: null,
  role,
  sectionId: null,
  tasks: [],
  ...pos,
})
const none: Pos = { positionX: null, positionY: null }

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

const L = member('L', 'リーダーA', 'leader')
const M1 = member('M1', 'メンバーB', 'member')
const M2 = member('M2', 'メンバーC', 'member')

describe('ProductTree(位置もセクションもないとき = これまでの見た目)', () => {
  const html = render({ tree: tree(L, [M1, M2]) })
  test('リーダーとメンバーが、自動配置で描かれ、これまでの CSS の線がある', () => {
    expect(html).toContain('リーダーA')
    expect(html).toContain('メンバーB')
    expect(html).toContain('メンバーC')
    expect(html).toContain('border-dashed')
  })
  test('セクションの四角も、SVG の線も、位置指定のカードも無い', () => {
    expect(html).not.toContain('data-section-id')
    expect(html).not.toContain('data-connector-to') // ツールバーのアイコンも SVG なので、線の目印で見る
    expect(html).not.toContain('left:') // 位置指定のスタイルを持つ要素(位置を持つカード・セクション)が無い
  })
  test('中身に、最小の大きさの指定もずらしも付かない(大きさは自動配置のまま)', () => {
    expect(html).not.toContain('min-width')
    expect(html).not.toContain('margin-left')
    expect(html).not.toContain('margin-top')
  })
})

describe('ProductTree(セクション)', () => {
  test('座標と大きさで四角を描き、色の見た目と名前の札を付ける', () => {
    const html = render({
      tree: tree(L, [M1]),
      sections: [section({ x: 120, y: 80, width: 320, height: 200, color: 'blue', sectionName: '開発' })],
    })
    expect(html).toContain('data-section-id="s1"')
    expect(html).toContain('left:120px;top:80px;width:320px;height:200px')
    expect(html).toContain('border-blue-500')
    expect(html).toContain('開発')
  })
  test('セクションは、カードより前(後ろに敷く)に出力される', () => {
    const html = render({ tree: tree(L, [M1]), sections: [section()] })
    expect(html.indexOf('data-section-id')).toBeLessThan(html.indexOf('リーダーA'))
  })
  test('複数のセクションを、それぞれの色で描く', () => {
    const html = render({
      tree: tree(L, []),
      sections: [
        section({ sectionId: 'a', color: 'red' }),
        section({ sectionId: 'b', color: 'green', sectionName: '運用' }),
      ],
    })
    expect(html).toContain('border-red-500')
    expect(html).toContain('border-green-500')
  })
  test('負の座標があるときは、自動配置を、その分だけずらす', () => {
    const html = render({ tree: tree(L, []), sections: [section({ x: -100, y: -30 })] })
    expect(html).toContain('margin-left:100px')
    expect(html).toContain('margin-top:30px')
    // 四角は、ずらしたあとの座標(0, 0)に置く(React は、値が 0 のとき単位を付けない)
    expect(html).toContain('left:0;top:0;width:300px;height:400px')
  })
  test('セクションを渡さなくても(取得に失敗しても)、ツリーは出る', () => {
    const html = render({ tree: tree(L, [M1]), sections: undefined })
    expect(html).toContain('メンバーB')
    expect(html).not.toContain('data-section-id')
  })
})

describe('ProductTree(カードの位置。座標は左上)', () => {
  test('位置を持つカードは、その座標(左上)に置かれ、自動配置には出ない', () => {
    const placed = member('M1', 'メンバーB', 'member', { positionX: 500, positionY: 200 })
    const html = render({ tree: tree(L, [placed, M2]) })
    expect(html).toContain('left:500px;top:200px')
    // メンバーBは、1 回だけ(位置指定のカードとして)出る
    expect(html.split('メンバーB').length - 1).toBe(1)
    // 位置が NULL のメンバーCは、自動配置のまま
    expect(html).toContain('メンバーC')
  })
  test('位置が NULL のカードは、自動配置のまま、これまでの CSS の線を持つ(一部だけ位置を持っていても崩れない)', () => {
    const placed = member('M1', 'メンバーB', 'member', { positionX: 500, positionY: 200 })
    const html = render({ tree: tree(L, [placed, M2]) })
    expect(html).toContain('border-dashed') // リーダー → メンバーC の CSS の線
  })
  test('位置を持つカードが収まる大きさを、最小の大きさに指定する(左上 + 幅 240)', () => {
    const placed = member('M1', 'メンバーB', 'member', { positionX: 500, positionY: 200 })
    const html = render({ tree: tree(L, [placed]) })
    expect(html).toContain('min-width:740px') // 500 + 240
  })
  test('負の座標のカードは、その分だけ全体をずらして置く', () => {
    const placed = member('M1', 'メンバーB', 'member', { positionX: -50, positionY: -20 })
    const html = render({ tree: tree(L, [placed]) })
    expect(html).toContain('margin-left:50px')
    expect(html).toContain('left:0;top:0') // -50 + 50、-20 + 20(React は、値が 0 のとき単位を付けない)
  })
  test('片方だけ値がある(あり得ない)カードは、自動配置のまま', () => {
    const odd = member('M1', 'メンバーB', 'member', { positionX: 10, positionY: null })
    const html = render({ tree: tree(L, [odd]) })
    expect(html).not.toContain('left:')
    expect(html).toContain('メンバーB')
  })
  test('リーダーが位置を持つとき、リーダーは座標に置かれ、メンバーは自動配置の行に残る(リーダーからの CSS の線は出ない)', () => {
    const leader = member('L', 'リーダーA', 'leader', { positionX: 300, positionY: 10 })
    const html = render({ tree: tree(leader, [M1]) })
    expect(html).toContain('left:300px;top:10px')
    expect(html).not.toContain('border-dashed')
    expect(html).toContain('メンバーB')
  })
  test('全員が位置を持つときは、自動配置の行は出ない', () => {
    const a = member('M1', 'メンバーB', 'member', { positionX: 0, positionY: 300 })
    const html = render({ tree: tree(L, [a]) })
    expect(html).not.toContain('<ul')
  })
})

describe('TreeToolbar', () => {
  const bar = (props: Record<string, unknown>) =>
    renderToStaticMarkup(createElement(TreeToolbar, { mode: 'pan', onModeChange: () => {}, ...props } as never))

  test('Figma の並びと寸法(410×86、ボタン 60×60)で、6 つのボタンと 2 つの区切りがある', () => {
    const html = bar({ onOpenMembers: () => {} })
    const labels = ['選択', '移動', 'メンバー', 'セクション', 'メモ', '検索']
    let last = -1
    for (const l of labels) {
      const at = html.indexOf(`<span>${l}</span>`)
      expect(at).toBeGreaterThan(last)
      last = at
    }
    expect(html).toContain('w-[410px]')
    expect(html).toContain('h-[86px]')
    expect(html.split('size-[60px]').length - 1).toBe(6)
    expect(html.split('w-0.5').length - 1).toBe(2)
  })
  test('選択された方のモードが、押された状態になる', () => {
    expect(bar({ mode: 'pan' })).toMatch(/aria-pressed="true"[^>]*>(?:(?!<button).)*移動/s)
    expect(bar({ mode: 'select' })).toMatch(/aria-pressed="true"[^>]*>(?:(?!<button).)*選択/s)
  })
  test('セクション・メモ・検索は、無効(準備中)', () => {
    const html = bar({ onOpenMembers: () => {} })
    expect(html.split('title="準備中"').length - 1).toBe(3)
    expect(html.split('disabled=""').length - 1).toBe(3)
  })
  test('メンバーは、リーダーのときだけ押せる', () => {
    expect(bar({ onOpenMembers: () => {} }).split('disabled=""').length - 1).toBe(3)
    const member = bar({})
    expect(member.split('disabled=""').length - 1).toBe(4)
    expect(member).toContain('title="リーダーのみ"')
  })
})
