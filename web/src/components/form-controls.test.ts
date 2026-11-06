import { describe, expect, test } from 'bun:test'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { CheckBox, SelectMenu, findByTypeahead, moveActive } from './form-controls'

// フォーム部品の、見た目と作りのスモークテスト(DOM なし。サーバーでのマークアップを検査する)と、キー操作の計算

const options = [
  { value: 'a', label: 'Alpha' },
  { value: 'b', label: 'Beta' },
  { value: 'c', label: 'Charlie' },
]

describe('moveActive(開いている一覧の、キーによる動き)', () => {
  test('下キーは 1 つ下へ、上キーは 1 つ上へ。端で止まる(ひと回りしない)', () => {
    expect(moveActive(0, 'ArrowDown', 3)).toBe(1)
    expect(moveActive(2, 'ArrowDown', 3)).toBe(2)
    expect(moveActive(1, 'ArrowUp', 3)).toBe(0)
    expect(moveActive(0, 'ArrowUp', 3)).toBe(0)
  })
  test('Home は先頭、End は末尾', () => {
    expect(moveActive(1, 'Home', 3)).toBe(0)
    expect(moveActive(1, 'End', 3)).toBe(2)
  })
  test('行がないときは 0。範囲の外の値は、範囲に収める。関係ないキーは動かさない', () => {
    expect(moveActive(5, 'ArrowDown', 0)).toBe(0)
    expect(moveActive(9, 'ArrowUp', 3)).toBe(1)
    expect(moveActive(-3, 'ArrowDown', 3)).toBe(1)
    expect(moveActive(1, 'x', 3)).toBe(1)
  })
})

describe('findByTypeahead(1 文字で、その文字で始まる行へ)', () => {
  test('現在の行の次から探す。大文字小文字は区別しない', () => {
    expect(findByTypeahead(options, 'b', 0)).toBe(1)
    expect(findByTypeahead(options, 'C', 0)).toBe(2)
  })
  test('末尾まで探して、なければ先頭へ戻る。見つからなければ -1', () => {
    expect(findByTypeahead(options, 'a', 1)).toBe(0)
    expect(findByTypeahead(options, 'z', 0)).toBe(-1)
  })
  test('同じ文字で始まる行が複数あるとき、押すたびに次の行へ進む', () => {
    const same = [
      { value: '1', label: 'Task A' },
      { value: '2', label: 'Task B' },
      { value: '3', label: 'Other' },
    ]
    expect(findByTypeahead(same, 't', 0)).toBe(1)
    expect(findByTypeahead(same, 't', 1)).toBe(0)
  })
})

describe('SelectMenu', () => {
  const html = renderToStaticMarkup(
    createElement(SelectMenu, { id: 's', value: 'b', options, onChange: () => {}, className: 'h-10' }),
  )
  test('開くボタンは combobox。選ばれている行の名前が出る。閉じているときは、一覧(listbox)を描かない', () => {
    expect(html).toMatch(/<button id="s" type="button" role="combobox" aria-haspopup="listbox" aria-expanded="false"/)
    expect(html).toContain('>Beta</span>')
    expect(html).not.toContain('role="listbox"')
    expect(html).not.toContain('<select')
  })
  test('テーマの矢印を、固定の 16px の箱の中央に置く(位置がずれない)。矢印は読み上げない', () => {
    expect(html).toMatch(/<span aria-hidden="true" class="flex size-4 shrink-0 items-center justify-center/)
    expect(html).toContain('<svg')
  })
  test('className は、開くボタンに付く(枠・高さなど)。無効のとき、disabled が付く', () => {
    expect(html).toContain('h-10')
    const disabled = renderToStaticMarkup(
      createElement(SelectMenu, { value: 'a', options, onChange: () => {}, disabled: true }),
    )
    expect(disabled).toMatch(/<button[^>]*disabled=""/)
  })
  test('選ばれている値が一覧にないときは、ボタンの名前は空', () => {
    const none = renderToStaticMarkup(createElement(SelectMenu, { value: 'zzz', options, onChange: () => {} }))
    expect(none).toContain('<span class="min-w-0 flex-1 truncate"></span>')
  })
})

describe('CheckBox', () => {
  const html = renderToStaticMarkup(createElement(CheckBox, { checked: true, onChange: () => {}, disabled: false }))
  test('ネイティブの checkbox を使い、標準の見た目(appearance)をやめる', () => {
    expect(html).toContain('type="checkbox"')
    expect(html).toContain('appearance-none')
    expect(html).toContain('checked=""')
  })
  test('四角とチェックの印は、同じ 16px の箱の中央に重なる。印は、チェックが入ったときだけ出る(peer-checked)', () => {
    expect(html).toContain('relative inline-flex size-4')
    expect(html).toContain('absolute inset-0')
    expect(html).toContain('peer-checked:flex')
    expect(html).toContain('<svg')
  })
  test('チェックが入ると文字色の塗り、紙の色のチェックの印。キーボードのフォーカスの枠がある', () => {
    expect(html).toContain('checked:bg-ink')
    expect(html).toContain('text-surface')
    expect(html).toContain('focus-visible:outline-2')
  })
})
