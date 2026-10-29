import { describe, expect, test } from 'bun:test'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { ProductTree } from './product-tree'
import { SectionNotice } from './section-notice'
import { SectionBox } from './section-box'
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
  test('座標と大きさで四角を描き、色の見た目(破線の枠と 20% の塗り)と、枠の上の名前を付ける', () => {
    const html = render({
      tree: tree(L, [M1]),
      sections: [section({ x: 120, y: 80, width: 320, height: 200, color: 'blue', sectionName: '開発' })],
    })
    expect(html).toContain('data-section-id="s1"')
    expect(html).toContain('left:120px;top:80px;width:320px;height:200px')
    expect(html).toContain('border-color:#3B82F6')
    expect(html).toContain('background-color:rgba(59, 130, 246, 0.2)')
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
    expect(html).toContain('border-color:#FF0004')
    expect(html).toContain('border-color:#22C55E')
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
    renderToStaticMarkup(createElement(TreeToolbar, { mode: 'select', onModeChange: () => {}, ...props } as never))

  test('並びと寸法(282×60、ボタン 48×48)で、5 つのボタンと 2 つの区切りがある。「移動」はない', () => {
    const html = bar({ onOpenMembers: () => {} })
    const labels = ['選択', 'メンバー', 'セクション', 'メモ', '検索']
    let last = -1
    for (const l of labels) {
      const at = html.indexOf(`<span>${l}</span>`)
      expect(at).toBeGreaterThan(last)
      last = at
    }
    expect(html).not.toContain('移動')
    expect(html).toContain('w-[282px]')
    expect(html).toContain('h-[60px]')
    expect(html.split('size-12').length - 1).toBe(5)
    expect(html.split('w-0.5').length - 1).toBe(2)
  })
  test('選択された方のモードが、押された状態になる', () => {
    expect(bar({ mode: 'select' })).toMatch(/aria-pressed="true"[^>]*>(?:(?!<button).)*選択/s)
  })
  test('メモ・検索は、無効(準備中)。セクションは、リーダーでなければ無効', () => {
    const html = bar({ onOpenMembers: () => {} })
    expect(html.split('title="準備中"').length - 1).toBe(2) // メモ・検索
    expect(html.split('disabled=""').length - 1).toBe(3) // メモ・検索・セクション(リーダーでない)
  })
  test('セクションは、リーダー(canEditSections)のときだけ押せる', () => {
    const leader = bar({ onOpenMembers: () => {}, canEditSections: true })
    expect(leader.split('disabled=""').length - 1).toBe(2) // メモ・検索だけ
    expect(leader).toContain('title="セクションを置く(Esc で戻る)"')
    const notLeader = bar({ onOpenMembers: () => {}, canEditSections: false })
    expect(notLeader).toContain('title="リーダーのみ"')
  })
  test('「セクション」の道具が選ばれているとき、セクションが押された状態になる', () => {
    expect(bar({ mode: 'section', canEditSections: true })).toMatch(/aria-pressed="true"[^>]*>(?:(?!<button).)*セクション/s)
  })
  test('メンバーは、リーダーのときだけ押せる', () => {
    expect(bar({ onOpenMembers: () => {} }).split('disabled=""').length - 1).toBe(3)
    const member = bar({})
    expect(member.split('disabled=""').length - 1).toBe(4)
    expect(member).toContain('title="リーダーのみ"')
  })
})

describe('ProductTree(表示の整理: 操作のヒントと、倍率の表示(%)・+/- と「全体表示」のボタンを置かない)', () => {
  const html = render({ tree: tree(L, [M1]) })
  test('細かい操作のヒントの文字が出ない', () => {
    expect(html).not.toContain('二本指スクロール')
    expect(html).not.toContain('2 本指で拡大縮小')
    expect(html).not.toContain('Ctrl+ホイール')
  })
  test('拡大・縮小のボタン(+ と −)と、「全体表示」のボタンが出ない。倍率(%)の表示も出ない', () => {
    expect(html).not.toContain('aria-label="拡大"')
    expect(html).not.toContain('aria-label="縮小"')
    expect(html).not.toContain('aria-label="全体を表示"')
    expect(html).not.toContain('title="全体を表示(0)"')
    expect(html).not.toContain('>全体表示</button>')
    // 倍率の表示(「80%」のような文字だけの要素)が無い
    expect(html).not.toMatch(/>\s*\d+%\s*</)
    expect(html).not.toContain('tabular-nums')
  })
  test('キーボードでの操作の案内(aria-label)は残る(全体表示は、キー 0 でできる)', () => {
    expect(html).toContain('+ と - で拡大縮小')
    expect(html).toContain('0 で全体表示')
  })
})

describe('ProductTree(道具・カーソル・リーダー)', () => {
  test('初期の道具は「選択」: 通常の矢印のカーソル(つかむ手ではない)', () => {
    const html = render({ tree: tree(L, [M1]) })
    expect(html).toContain('cursor-default')
    expect(html).not.toContain('cursor-grab')
  })
  test('リーダーでなければ、「セクション」は押せない(セクションを選ぶこともできない)', () => {
    const html = render({ tree: tree(L, [M1]), sections: [section()], canEditSections: false })
    expect(html).toContain('title="リーダーのみ"')
    expect(html).not.toContain('data-selected')
  })
  test('リーダー(canEditSections)なら、「セクション」が押せる', () => {
    const html = render({ tree: tree(L, [M1]), canEditSections: true })
    expect(html).toContain('title="セクションを置く(Esc で戻る)"')
  })
  test('通知(失敗の知らせ)がなければ、role="alert" は出ない。あれば、メッセージが出る', () => {
    expect(render({ tree: tree(L, [M1]) })).not.toContain('role="alert"')
    const html = render({
      tree: tree(L, [M1]),
      sectionActions: {
        notice: { id: 1, message: '同じ名前のセクションがすでにあります' },
        dismissNotice: () => {},
        createSection: async () => null,
        updateSection: async () => false,
        deleteSection: async () => false,
        moveMember: async () => false,
      },
    })
    expect(html).toContain('role="alert"')
    expect(html).toContain('同じ名前のセクションがすでにあります')
  })
})

describe('SectionNotice', () => {
  test('role="alert" で、メッセージと閉じるボタンが出る', () => {
    const html = renderToStaticMarkup(createElement(SectionNotice, { id: 1, message: 'テスト', onDismiss: () => {} }))
    expect(html).toContain('role="alert"')
    expect(html).toContain('テスト')
    expect(html).toContain('aria-label="閉じる"')
  })
})

describe('SectionBox(選択・ドロップ先の見た目)', () => {
  const box = (props: Record<string, unknown>) =>
    renderToStaticMarkup(createElement(SectionBox, { section: section() as never, ...props } as never))
  test('選択中は、輪郭と data-selected が付く。そうでなければ付かない', () => {
    expect(box({ selected: true })).toContain('data-selected="true"')
    expect(box({ selected: true })).toContain('outline-ink')
    expect(box({})).not.toContain('data-selected')
    expect(box({})).not.toContain('outline-ink')
  })
  test('カードのドロップ先(highlighted)は、輪を足して塗りを濃くし、data-highlighted が付く', () => {
    expect(box({ highlighted: true })).toContain('data-highlighted="true"')
    expect(box({ highlighted: true })).toContain('ring-4')
    expect(box({})).not.toContain('data-highlighted')
    expect(box({})).not.toContain('ring-4')
    // 塗りは、通常 20%、ドロップ先は 35%(赤 #FF0004)
    expect(box({})).toContain('background-color:rgba(255, 0, 4, 0.2)')
    expect(box({ highlighted: true })).toContain('background-color:rgba(255, 0, 4, 0.35)')
  })
})

describe('SectionBox(Figma の見た目: 破線・20% の塗り・枠の上の名前)', () => {
  const box = (props: Record<string, unknown>) =>
    renderToStaticMarkup(createElement(SectionBox, { section: section() as never, ...props } as never))
  test('枠は破線で、色は赤 #FF0004、内側は同じ色の 20%', () => {
    const html = box({})
    expect(html).toContain('border-dashed')
    expect(html).toContain('border-2')
    expect(html).toContain('border-color:#FF0004')
    expect(html).toContain('background-color:rgba(255, 0, 4, 0.2)')
  })
  test('名前は、色つきの札ではなく、枠の上の文字(札の背景色・固定の札の大きさが無い)', () => {
    const html = box({ section: section({ sectionName: 'デザイン' }) as never })
    const label = html.slice(html.indexOf('data-section-label'))
    expect(label).toContain('デザイン')
    expect(label).toContain('text-ink')
    expect(html).not.toMatch(/\bbg-(red|yellow|green|purple|sky|blue)-\d+/)
    expect(html).not.toContain('w-[120px]')
    expect(html).not.toContain('h-8')
  })
  test('名前は、外側の上辺の 16px 上の帯に置く(枠線 2px の内側基準で、上 -18px・左 4px)', () => {
    const html = box({})
    expect(html).toContain('top:-18px')
    expect(html).toContain('left:4px')
    expect(html).toContain('height:16px')
  })
  test('長い名前は、省略記号にする(truncate)。名前の全文は title に残る', () => {
    const html = box({ section: section({ sectionName: 'とてもとてもとてもとても長いセクションの名前' }) as never })
    expect(html).toContain('truncate')
    expect(html).toContain('title="とてもとてもとてもとても長いセクションの名前"')
  })
})

describe('ProductTree(セクションの動かす面。カードの下・リーダーだけ)', () => {
  const at = (html: string, needle: string) => html.indexOf(needle)
  // 目印の属性を持つ要素の、開きタグ(`<div ...`)を取り出す
  const openTag = (html: string, marker: string) => {
    const i = html.indexOf(marker)
    return html.slice(html.lastIndexOf('<div', i), html.indexOf('>', i) + 1)
  }
  const leaderHtml = render({
    tree: tree(L, [M1]),
    sections: [section()],
    canEditSections: true,
  })

  test('リーダーなら、セクションごとに動かす面が出る(リーダーでなければ、出ない)', () => {
    expect(leaderHtml).toContain('data-section-move-surface="s1"')
    const viewer = render({ tree: tree(L, [M1]), sections: [section()], canEditSections: false })
    expect(viewer).not.toContain('data-section-move-surface')
  })

  test('重ね順: セクションの四角 → 動かす面 → カード → 編集枠(DOM の順序。後に描くものが手前)', () => {
    const box = at(leaderHtml, 'data-section-id="s1"')
    const surface = at(leaderHtml, 'data-section-move-surface="s1"')
    const card = at(leaderHtml, 'data-card-id=')
    const editor = at(leaderHtml, 'data-section-editor="s1"')
    expect(box).toBeGreaterThanOrEqual(0)
    expect(surface).toBeGreaterThan(box)
    expect(card).toBeGreaterThan(surface) // 面は、カードの下(カードのドラッグを奪わない)
    expect(editor).toBeGreaterThan(card) // 編集枠(札・帯・ハンドル)は、カードの上
  })

  test('重なるセクションは、面積の大きい順に並べる(内側の小さいセクションが手前=先につかめる)', () => {
    const big = section({ sectionId: 'big', width: 600, height: 600 })
    const small = section({ sectionId: 'small', sectionName: '内側', x: 50, y: 50, width: 100, height: 100 })
    // 配列の順(名前順など)に関わらず、面は大きい順
    for (const sections of [[small, big], [big, small]]) {
      const html = render({ tree: tree(L, [M1]), sections, canEditSections: true })
      expect(at(html, 'data-section-move-surface="big"')).toBeGreaterThanOrEqual(0)
      expect(at(html, 'data-section-move-surface="small"')).toBeGreaterThan(at(html, 'data-section-move-surface="big"'))
    }
  })

  test('面を出すとき、自動配置の枠はポインタを通す。カードの包み(DragSlot)は受ける', () => {
    // カードの間の空いた場所が、面のドラッグを遮らない
    expect(openTag(leaderHtml, 'data-flow-layer')).toContain('pointer-events-none')
    // カードの包みは、pointer-events-auto で、これまでどおり受ける
    expect(leaderHtml).toContain('data-drag-slot')
    expect(openTag(leaderHtml, 'data-drag-slot')).toContain('pointer-events-auto')
  })

  test('リーダーでなければ、自動配置の枠はこれまでどおり(ポインタを通さない設定を付けない)', () => {
    const viewer = render({ tree: tree(L, [M1]), sections: [section()], canEditSections: false })
    expect(openTag(viewer, 'data-flow-layer')).not.toContain('pointer-events-none')
    expect(viewer).not.toContain('data-drag-slot')
  })

  test('位置を持つカードは、面より手前(DOM の順序で後)に描かれる', () => {
    const placed = member('P', '位置ありC', 'member', { positionX: 40, positionY: 60 })
    const html = render({ tree: tree(L, [placed]), sections: [section()], canEditSections: true })
    const surface = at(html, 'data-section-move-surface="s1"')
    const placedCard = at(html, 'left:40px')
    expect(placedCard).toBeGreaterThan(surface)
  })
})
