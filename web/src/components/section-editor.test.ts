import { describe, expect, test } from 'bun:test'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { SectionColorPicker } from './section-color-picker'
import { SectionEditor, type SectionEditorProps } from './section-editor'
import { SectionEditorMenu } from './section-editor-menu'
import { SectionNameEditor } from './section-name-editor'

// 画面部品の、最小のスモークテスト(DOM なし。サーバーでのマークアップを検査する)
// ポインタ・キーボードでの実際の動き(ドラッグ・確定・Esc)は、ブラウザが要るので、ここでは確かめない。
//   その判定は `section-editor-state.test.ts`(状態遷移の関数)で、守っている
//   ここで確かめるのは: 出すもの・出さないもの(canEdit / selected)、つかみ場所の数、ハンドルの数と見た目の大きさ、メニューの中身

const section = {
  sectionId: 's1',
  sectionName: '設計チーム',
  color: 'red' as const,
  x: 100,
  y: 200,
  width: 300,
  height: 400,
}

const base: SectionEditorProps = {
  section,
  selected: false,
  canEdit: true,
  scale: 1,
  onSelect: () => {},
  onChange: () => {},
  onRename: () => {},
  onColorChange: () => {},
  onDelete: () => {},
}

const render = (over: Partial<SectionEditorProps> = {}) =>
  renderToStaticMarkup(createElement(SectionEditor, { ...base, ...over }))
const count = (html: string, needle: string) => html.split(needle).length - 1

describe('SectionEditor: 出すもの・出さないもの', () => {
  test('canEdit が false のときは、何も出さない(選択もできない)', () => {
    expect(render({ canEdit: false })).toBe('')
    expect(render({ canEdit: false, selected: true })).toBe('')
  })

  test('未選択: つかめる帯が 4 つと札はあるが、ハンドルもメニューも出ない', () => {
    const html = render()
    expect(html).toContain('data-section-editor="s1"')
    expect(count(html, 'data-section-band=')).toBe(4)
    for (const side of ['top', 'right', 'bottom', 'left']) expect(html).toContain(`data-section-band="${side}"`)
    expect(count(html, 'data-section-tag')).toBe(1)
    expect(html).not.toContain('data-resize-handle')
    expect(html).not.toContain('data-section-menu')
    expect(html).not.toContain('data-selected')
  })

  test('未選択のとき、内側はポインタを通す(内側のつかみ場所が無い)', () => {
    const html = render()
    expect(html).not.toContain('data-section-interior')
    // 外側の枠は、ポインタを通す
    expect(html).toMatch(/^<div[^>]*pointer-events-none/)
  })

  test('interiorSelectable のときだけ、内側のクリックで選択できる層が出る', () => {
    expect(render({ interiorSelectable: true })).toContain('data-section-interior')
    expect(render({ interiorSelectable: false })).not.toContain('data-section-interior')
  })

  test('選択中: ハンドルが 8 つ(角 4 つと辺 4 つ)、メニューのボタン、選択の印', () => {
    const html = render({ selected: true })
    expect(count(html, 'data-resize-handle=')).toBe(8)
    for (const h of ['nw', 'n', 'ne', 'e', 'se', 's', 'sw', 'w']) expect(html).toContain(`data-resize-handle="${h}"`)
    expect(html).toContain('aria-label="セクションのメニュー"')
    expect(html).toContain('data-selected="true"')
  })

  test('メニューは、最初は閉じている(色の選択も削除も出ない)', () => {
    const html = render({ selected: true })
    expect(html).not.toContain('role="menu"')
    expect(html).not.toContain('セクションの色')
    expect(html).not.toContain('削除')
  })

  test('ドラッグ中のプレビューは、最初は出ない', () => {
    expect(render({ selected: true })).not.toContain('data-section-preview')
  })
})

describe('SectionEditor: 位置と、見た目の大きさ', () => {
  test('四角の位置と大きさで置く。offsetX / offsetY は、表示の位置にだけ足す(SectionBox と同じ)', () => {
    const plain = render()
    expect(plain).toContain('left:100px;top:200px;width:300px;height:400px')
    const shifted = render({ offsetX: 50, offsetY: -20 })
    expect(shifted).toContain('left:150px;top:180px;width:300px;height:400px')
  })

  test('ハンドルの見た目の大きさは、拡大率で割る(拡大率 1 で 12px、2 で 6px、0.5 で 24px)', () => {
    const handleStyle = (html: string) => /data-resize-handle="nw"[^>]*style="([^"]*)"/.exec(html)?.[1] ?? ''
    expect(handleStyle(render({ selected: true, scale: 1 }))).toContain('width:12px;height:12px')
    expect(handleStyle(render({ selected: true, scale: 2 }))).toContain('width:6px;height:6px')
    expect(handleStyle(render({ selected: true, scale: 0.5 }))).toContain('width:24px;height:24px')
  })

  test('ハンドルは、角と辺の中央に、中心を合わせて置く(拡大率 1 で、北西は -6px)', () => {
    const html = render({ selected: true, scale: 1 })
    const styleOf = (handle: string) =>
      new RegExp(`data-resize-handle="${handle}"[^>]*style="([^"]*)"`).exec(html)?.[1] ?? ''
    expect(styleOf('nw')).toContain('left:-6px;top:-6px')
    expect(styleOf('se')).toContain('left:294px;top:394px') // 300 - 6, 400 - 6
    expect(styleOf('n')).toContain('left:144px;top:-6px') // 150 - 6
    expect(styleOf('w')).toContain('left:-6px;top:194px') // 200 - 6
  })

  test('ハンドルにマウスカーソルの形が付く', () => {
    const html = render({ selected: true })
    expect(html).toContain('cursor:nwse-resize')
    expect(html).toContain('cursor:nesw-resize')
    expect(html).toContain('cursor:ns-resize')
    expect(html).toContain('cursor:ew-resize')
  })

  test('選択中の帯・札は「移動」のカーソル、未選択は「ポインタ」', () => {
    expect(render({ selected: true })).toContain('cursor:move')
    expect(render({ selected: false })).toContain('cursor:pointer')
  })
})

describe('SectionColorPicker', () => {
  test('6 色が並び、いまの色だけが押された状態(aria-pressed)', () => {
    const html = renderToStaticMarkup(createElement(SectionColorPicker, { value: 'green', onPick: () => {} }))
    for (const label of ['赤', '黄', '緑', '紫', '水色', '青']) expect(html).toContain(`aria-label="${label}"`)
    expect(count(html, 'aria-pressed="true"')).toBe(1)
    expect(count(html, 'aria-pressed="false"')).toBe(5)
    expect(/aria-label="緑"[^>]*aria-pressed="true"/.test(html) || /aria-pressed="true"[^>]*aria-label="緑"/.test(html)).toBe(true)
  })

  test('色の見た目は、札の色(section-style)と同じ', () => {
    const html = renderToStaticMarkup(createElement(SectionColorPicker, { value: 'red', onPick: () => {} }))
    expect(html).toContain('bg-red-500')
    expect(html).toContain('bg-sky-400')
    expect(html).toContain('bg-blue-500')
  })
})

describe('SectionEditorMenu', () => {
  const menu = (state: 'closed' | 'menu' | 'confirm-delete', scale = 1) =>
    renderToStaticMarkup(
      createElement(SectionEditorMenu, {
        name: '設計チーム',
        color: 'red',
        menu: state,
        scale,
        onToggle: () => {},
        onPickColor: () => {},
        onAskDelete: () => {},
        onCancelDelete: () => {},
        onConfirmDelete: () => {},
      }),
    )

  test('閉じているときは、ボタンだけ(aria-expanded が false)', () => {
    const html = menu('closed')
    expect(html).toContain('aria-expanded="false"')
    expect(html).not.toContain('セクションの色')
  })

  test('開くと、色の選択と、削除のボタンが出る', () => {
    const html = menu('menu')
    expect(html).toContain('aria-expanded="true"')
    expect(html).toContain('セクションの色')
    expect(html).toContain('>削除<')
    expect(html).not.toContain('を削除しますか')
  })

  test('削除は確認を挟む: 名前と、中のメンバーが無所属に戻ることを示し、「削除する」「やめる」が出る', () => {
    const html = menu('confirm-delete')
    expect(html).toContain('role="alertdialog"')
    expect(html).toContain('「設計チーム」を削除しますか?')
    expect(html).toContain('中のメンバーは無所属に戻ります')
    expect(html).toContain('削除する')
    expect(html).toContain('やめる')
    expect(html).not.toContain('セクションの色')
  })

  test('拡大率を打ち消す(拡大率 2 で scale(0.5))。札のとなりに置く', () => {
    const html = menu('closed', 2)
    expect(html).toContain('scale(0.5)')
    expect(html).toContain('left:144px;top:-16px') // 18 + 120 + 6、-16
  })
})

describe('SectionNameEditor', () => {
  const editor = (initial: string) =>
    renderToStaticMarkup(
      createElement(SectionNameEditor, { initial, className: 'bg-red-500', onCommit: () => {}, onCancel: () => {} }),
    )

  test('いまの名前が入った入力欄が出る', () => {
    const html = editor('設計チーム')
    expect(html).toContain('<input')
    expect(html).toContain('aria-label="セクション名"')
    expect(html).toContain('value="設計チーム"')
    expect(html).toContain('bg-red-500')
  })

  test('50 文字を超える名前は、50 文字に収めて入る', () => {
    const html = editor('あ'.repeat(60))
    const value = /value="([^"]*)"/.exec(html)?.[1] ?? ''
    expect([...value].length).toBe(50)
  })
})
