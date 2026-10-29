import { describe, expect, test } from 'bun:test'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { Trash2 } from 'lucide-react'
import { IconButton } from './icon-button'

const render = (props: Record<string, unknown> = {}) =>
  renderToStaticMarkup(createElement(IconButton, { icon: Trash2, label: '削除', ...props } as never))

describe('IconButton', () => {
  test('名前は aria-label、アイコンは読み上げから外す、種類は button', () => {
    const html = render()
    expect(html).toContain('aria-label="削除"')
    expect(html).toContain('type="button"')
    expect(html).toMatch(/<svg[^>]*aria-hidden="true"/)
  })

  test('ツールチップは、既定でラベルと同じ文字。読み上げからは外す', () => {
    const html = render()
    expect(html).toMatch(/<span aria-hidden="true"[^>]*>削除<\/span>/)
    expect(html).toContain('group-hover/tip:opacity-100')
    expect(html).toContain('group-focus-within/tip:opacity-100')
  })

  test('tip を渡すと、ツールチップの文字だけ変わる(名前は変わらない)', () => {
    const html = render({ tip: 'リーダーのみ' })
    expect(html).toContain('aria-label="削除"')
    expect(html).toContain('>リーダーのみ</span>')
  })

  test('押せないボタンでも、ツールチップの要素は出る(理由を示せる)', () => {
    const html = render({ disabled: true, tip: 'リーダーのみ' })
    expect(html).toContain('disabled=""')
    expect(html).toContain('>リーダーのみ</span>')
  })

  test('pressed は aria-pressed と押された見た目になる。省略なら aria-pressed を出さない', () => {
    expect(render({ pressed: true })).toContain('aria-pressed="true"')
    expect(render({ pressed: true })).toContain('bg-ink text-surface')
    expect(render()).not.toContain('aria-pressed')
  })

  test('side でツールチップの位置が変わる', () => {
    expect(render({ side: 'bottom' })).toContain('top-full')
    expect(render({ side: 'left' })).toContain('right-full')
    expect(render()).toContain('bottom-full')
  })

  test('大きさとバリアントが効く', () => {
    expect(render({ size: 'lg' })).toContain('size-12')
    expect(render({ size: 'sm' })).toContain('size-7')
    expect(render({ variant: 'outline' })).toContain('border-2 border-ink')
  })

  test('onClick や data- などの属性を、ボタンに渡す', () => {
    const html = render({ 'data-row': true, form: 'f1' })
    expect(html).toContain('data-row="true"')
    expect(html).toContain('form="f1"')
  })
})
