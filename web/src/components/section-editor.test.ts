import { describe, expect, test } from 'bun:test'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { LABEL_FONT_PX, LABEL_LINE_PX, titleFactor } from '../lib/section-label'
import { SectionBox } from './section-box'
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

  test('選択中: ハンドルが 8 つ(角 4 つと辺 4 つ)と、選択の印。「⋯」のメニューのボタンは出ない', () => {
    const html = render({ selected: true })
    expect(count(html, 'data-resize-handle=')).toBe(8)
    for (const h of ['nw', 'n', 'ne', 'e', 'se', 's', 'sw', 'w']) expect(html).toContain(`data-resize-handle="${h}"`)
    expect(html).toContain('data-selected="true"')
    // 「⋯」のボタン(ユーザーの指示で消した)
    expect(html).not.toContain('aria-label="セクションのメニュー"')
    expect(html).not.toContain('aria-haspopup')
    expect(html).not.toContain('<button')
    expect(html).not.toContain('data-section-menu')
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

describe('SectionEditor: 名前(枠の上の文字)をつかむ場所は、SectionBox の文字の位置に合う', () => {
  // 名前をつかむ場所の外枠(`data-section-tag` の親)の style を取り出す
  const tagBox = (html: string) => {
    const i = html.indexOf('data-section-tag')
    const open = html.lastIndexOf('<div', html.lastIndexOf('<div', i) - 1)
    return /style="([^"]*)"/.exec(html.slice(open, i))?.[1] ?? ''
  }
  test('幅 300 のセクション: 左端から、上辺の 20px 上〜4px 下(幅 160、高さ 24)。文字の帯(16px 上〜上辺)を含む', () => {
    expect(tagBox(render())).toBe('left:0;top:-20px;width:160px;height:24px')
  })
  test('狭いセクション(幅 80)は、セクションの幅いっぱい(「⋯」のボタンを消したので、メニューの分の空きは無い)', () => {
    const narrow = { ...section, width: 80 }
    expect(tagBox(render({ section: narrow }))).toBe('left:0;top:-20px;width:80px;height:24px')
  })
  test('名前のつかむ場所の上辺(-20)は、文字の帯の上辺(-16)より上にあり、旧い札(左へ 18px・120×32)の位置ではない', () => {
    const html = render()
    expect(html).not.toContain('left:18px;top:-16px')
    expect(html).not.toContain('width:120px;height:32px')
  })
  test('選択中でも、メニューのボタンは、名前のつかむ場所の右どなりに出ない(旧い位置: 幅 300 で左 166px・上 -16px)', () => {
    expect(render({ selected: true })).not.toContain('left:166px;top:-16px')
    expect(render({ selected: true, section: { ...section, width: 80 } })).not.toContain('left:46px;top:-16px')
  })
  test('ドラッグ中でなければ、元の四角の幅で決まる(offsetX は名前の位置を変えない)', () => {
    expect(tagBox(render({ offsetX: 50, offsetY: -20 }))).toBe('left:0;top:-20px;width:160px;height:24px')
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

  test('見本の色は、枠の破線と同じ線の色(section-style)。赤は Figma の #FF0004', () => {
    const html = renderToStaticMarkup(createElement(SectionColorPicker, { value: 'red', onPick: () => {} }))
    const swatch = (color: string) =>
      new RegExp(`data-swatch="${color}"[^>]*style="([^"]*)"`).exec(html)?.[1] ?? ''
    expect(swatch('red')).toContain('background-color:#FF0004')
    expect(swatch('lightblue')).toContain('background-color:#38BDF8')
    expect(swatch('blue')).toContain('background-color:#3B82F6')
    // 6 色すべてに、見本の色がある(札の色のクラスは使わない)
    expect(count(html, 'data-swatch=')).toBe(6)
    expect(html).not.toMatch(/\bbg-(red|yellow|green|purple|sky|blue)-\d+/)
  })
})

describe('SectionEditorMenu(「⋯」のボタンは無い。キーボードの Delete で開く、削除の確認だけが出る)', () => {
  const menu = (state: 'closed' | 'menu' | 'confirm-delete', scale = 1) =>
    renderToStaticMarkup(
      createElement(SectionEditorMenu, {
        name: '設計チーム',
        color: 'red',
        menu: state,
        scale,
        offset: { left: 0, top: 4 },
        onPickColor: () => {},
        onAskDelete: () => {},
        onCancelDelete: () => {},
        onConfirmDelete: () => {},
      }),
    )

  test('閉じているときは、何も出さない(ボタンは無い)', () => {
    const html = menu('closed')
    expect(html).toBe('')
    expect(html).not.toContain('<button')
    expect(html).not.toContain('aria-expanded')
  })

  test('削除の確認: 名前と、中のメンバーが無所属に戻ることを示し、「削除する」「やめる」が出る(メニューのボタンは出ない)', () => {
    const html = menu('confirm-delete')
    expect(html).toContain('role="alertdialog"')
    expect(html).toContain('「設計チーム」を削除しますか?')
    expect(html).toContain('中のメンバーは無所属に戻ります')
    expect(html).toContain('削除する')
    expect(html).toContain('やめる')
    expect(html).not.toContain('セクションの色')
    expect(html).not.toContain('aria-haspopup')
    expect(html).not.toContain('aria-label="セクションのメニュー"')
  })

  test('色の選択のメニュー(開く入口は無い。部品は、後で別の入口をつけるために残してある): 開けば、色の選択と削除が出る', () => {
    const html = menu('menu')
    expect(html).toContain('role="menu"')
    expect(html).toContain('セクションの色')
    expect(html).toContain('>削除<')
    expect(html).not.toContain('を削除しますか')
    expect(html).not.toContain('aria-expanded')
  })

  test('拡大率を打ち消す(拡大率 2 で scale(0.5))。渡された位置に置く', () => {
    const html = menu('confirm-delete', 2)
    expect(html).toContain('scale(0.5)')
    expect(html).toContain('left:0;top:4px')
  })
})

describe('SectionNameEditor', () => {
  const editor = (initial: string) =>
    renderToStaticMarkup(
      createElement(SectionNameEditor, { initial, className: 'bg-surface text-ink', onCommit: () => {}, onCancel: () => {} }),
    )

  test('いまの名前が入った入力欄が出る(下の名前の文字を隠すため、背景を塗る)', () => {
    const html = editor('設計チーム')
    expect(html).toContain('<input')
    expect(html).toContain('aria-label="セクション名"')
    expect(html).toContain('value="設計チーム"')
    expect(html).toContain('bg-surface')
    expect(html).toContain('text-ink')
  })

  test('50 文字を超える名前は、50 文字に収めて入る', () => {
    const html = editor('あ'.repeat(60))
    const value = /value="([^"]*)"/.exec(html)?.[1] ?? ''
    expect([...value].length).toBe(50)
  })
})

describe('名前は、縮小しても読める大きさを保つ(scale < 1 で、キャンバスの単位を 1 / scale 倍にする。scale ≥ 1 は拡大に比例)', () => {
  // 名前(`data-section-label`)の style を取り出す
  const labelStyle = (html: string) => {
    const i = html.indexOf('data-section-label')
    const open = html.lastIndexOf('<span', i)
    return /style="([^"]*)"/.exec(html.slice(open))?.[1] ?? ''
  }
  const box = (scale?: number) =>
    renderToStaticMarkup(createElement(SectionBox, scale === undefined ? { section } : { section, scale }))
  // 名前をつかむ場所の外枠の style を取り出す
  const tagBox = (html: string) => {
    const i = html.indexOf('data-section-tag')
    const open = html.lastIndexOf('<div', html.lastIndexOf('<div', i) - 1)
    return /style="([^"]*)"/.exec(html.slice(open, i))?.[1] ?? ''
  }
  const px = (style: string, prop: string) => {
    const m = new RegExp(`(?:^|;)${prop}:(-?[0-9.]+)px`).exec(style)
    return m ? Number(m[1]) : Number.NaN
  }

  test('等倍(scale 1)と、scale を渡さないとき: 名前の文字は、キャンバスの単位の px(14px、行の高さ 16px)。rem 基準のクラス(text-sm)は使わない', () => {
    for (const html of [box(), box(1)]) {
      const style = labelStyle(html)
      expect(style).toContain(`font-size:${LABEL_FONT_PX}px`)
      expect(style).toContain(`line-height:${LABEL_LINE_PX}px`)
      expect(html).not.toContain('text-sm')
    }
  })

  test('縮小(scale 0.25)では、係数 4 で拡大される(文字 56px、行の高さ 64px。画面上は 14px・16px)', () => {
    const style = labelStyle(box(0.25))
    expect(style).toContain('font-size:56px')
    expect(style).toContain('line-height:64px')
    // 位置: 外側の左上が原点。左の余白 6 × 4 = 24、帯の上 16 × 4 = 64。絶対配置の基準は枠線(2px。係数は掛けない)の内側なので、その分だけ戻す
    expect(px(style, 'left')).toBe(24 - 2)
    expect(px(style, 'top')).toBe(-64 - 2)
  })

  test('拡大(scale 2、4)では、係数 1(キャンバスの単位のまま。画面上は scale 倍に大きくなる)', () => {
    for (const s of [1.5, 2, 4]) {
      const style = labelStyle(box(s))
      expect(style).toContain('font-size:14px')
      expect(style).toContain('line-height:16px')
    }
  })

  test('名前の画面上の大きさは、1/8 ≤ scale ≤ 1 で 14px で一定(キャンバスの単位の文字の大きさ × scale)', () => {
    for (const s of [1, 0.75, 0.5, 0.25, 0.125]) {
      expect(px(labelStyle(box(s)), 'font-size') * s).toBeCloseTo(14, 8)
    }
  })

  test('上限(係数 8)で止まる: scale 0.05 でも、文字は 112px(画面上は 5.6px)', () => {
    expect(labelStyle(box(0.05))).toContain('font-size:112px')
    expect(labelStyle(box(0.001))).toContain('font-size:112px')
  })

  test('名前の描画は、拡大率を打ち消す変換(scale(…))を持たない(大きさは、キャンバスの単位の寸法で表す。変換は、親のキャンバスの層がかける)', () => {
    for (const s of [0.25, 1, 4]) {
      const html = box(s)
      expect(html).not.toContain('scale(')
      expect(html).not.toContain('transform')
    }
  })

  test('名前をつかむ場所は、縮小すると、同じ係数で大きくなる(画面上の大きさは一定)。拡大では、キャンバスの単位で同じ', () => {
    const at = (scale: number) => tagBox(render({ scale }))
    // 等倍: 左 0、上 -(16 + 4)、幅は上限 160、高さ 16 + 4 × 2
    expect(at(1)).toBe('left:0;top:-20px;width:160px;height:24px')
    expect(at(4)).toBe(at(1))
    expect(at(2)).toBe(at(1))
    // 係数 4(scale 0.25): 上 -(64 + 16)、幅は上限 640 と、セクションの幅 300 の小さい方、高さ 64 + 32
    expect(at(0.25)).toBe('left:0;top:-80px;width:300px;height:96px')
    // 係数 2(scale 0.5): 上 -(32 + 8)、幅 300、高さ 32 + 16
    expect(at(0.5)).toBe('left:0;top:-40px;width:300px;height:48px')
    // 上限(係数 8): 上 -(128 + 32)、高さ 128 + 64
    expect(at(0.05)).toBe('left:0;top:-160px;width:300px;height:192px')
  })

  test('名前をつかむ場所は、名前の文字と、同じ位置・同じ高さの帯(どの scale でも、文字の帯を含み、中心が同じ)', () => {
    for (const s of [0.05, 0.125, 0.25, 0.5, 1, 2, 4]) {
      const label = labelStyle(box(s))
      const tag = tagBox(render({ scale: s }))
      const textTop = px(label, 'top') + 2 // 枠線の分を戻して、外側の左上が原点の値にする
      const textHeight = px(label, 'height')
      const hitTop = px(tag, 'top')
      const hitHeight = px(tag, 'height')
      expect(hitTop).toBeLessThan(textTop)
      expect(hitTop + hitHeight).toBeGreaterThan(textTop + textHeight)
      expect(hitTop + hitHeight / 2).toBeCloseTo(textTop + textHeight / 2, 8)
    }
  })

  test('名前の入力欄の文字は、名前と同じ大きさ・行の高さ・左右の余白(同じ係数。縮小しても、一緒に読める大きさを保つ)', () => {
    const input = (factor?: number) =>
      renderToStaticMarkup(
        createElement(SectionNameEditor, {
          initial: '設計チーム',
          ...(factor === undefined ? {} : { factor }),
          onCommit: () => {},
          onCancel: () => {},
        }),
      )
    for (const html of [input(), input(1)]) {
      expect(html).toContain(`font-size:${LABEL_FONT_PX}px`)
      expect(html).toContain(`line-height:${LABEL_LINE_PX}px`)
      expect(html).toContain('padding-left:6px')
      expect(html).toContain('padding-right:6px')
    }
    const x4 = input(4)
    expect(x4).toContain('font-size:56px')
    expect(x4).toContain('line-height:64px')
    expect(x4).toContain('padding-left:24px')
    expect(x4).toContain('padding-right:24px')
    expect(x4).not.toContain('text-sm')
    expect(x4).not.toContain('scale(')
  })

  test('名前の表示・つかむ場所・入力欄は、同じ scale で、同じ係数(文字の大きさが一致する)', () => {
    for (const s of [0.05, 0.25, 0.5, 1, 2]) {
      const factor = titleFactor(s)
      const labelFont = px(labelStyle(box(s)), 'font-size')
      const inputHtml = renderToStaticMarkup(
        createElement(SectionNameEditor, { initial: 'x', factor, onCommit: () => {}, onCancel: () => {} }),
      )
      const inputFont = Number(/font-size:([0-9.]+)px/.exec(inputHtml)?.[1])
      expect(inputFont).toBe(labelFont)
      expect(labelFont).toBe(LABEL_FONT_PX * factor)
    }
  })
})
