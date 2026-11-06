import { describe, expect, test } from 'bun:test'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { CheckBox, SelectBox } from './form-controls'

// フォーム部品の、見た目と作りのスモークテスト(DOM なし。サーバーでのマークアップを検査する)

describe('SelectBox', () => {
  const html = renderToStaticMarkup(
    createElement(SelectBox, { id: 's', value: 'a', onChange: () => {}, className: 'h-10' }, createElement('option', { value: 'a' }, 'A')),
  )
  test('ネイティブの select を使い、標準の矢印(appearance)をやめて、右に矢印の分の余白を足す', () => {
    expect(html).toContain('<select id="s"')
    expect(html).toContain('appearance-none')
    expect(html).toContain('pr-9')
    expect(html).toContain('h-10')
  })
  test('テーマの矢印を、右端の同じ幅の箱の中央に重ねる(位置がずれない)。矢印はポインタを通し、読み上げない', () => {
    expect(html).toContain('pointer-events-none')
    expect(html).toContain('aria-hidden="true"')
    expect(html).toMatch(/absolute inset-y-0 right-0 flex w-9 items-center justify-center/)
    expect(html).toContain('<svg')
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
