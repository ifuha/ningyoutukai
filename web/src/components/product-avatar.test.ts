import { describe, expect, test } from 'bun:test'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { ProductAvatar } from './product-avatar'

const render = (src: string | null) => renderToStaticMarkup(createElement(ProductAvatar, { src, name: 'A' }))

describe('ProductAvatar', () => {
  test('avatarUrl があれば img(24×24、角丸 4px、alt は空)', () => {
    const html = render('https://example.com/a.png')
    expect(html).toContain('<img')
    expect(html).toContain('src="https://example.com/a.png"')
    expect(html).toContain('alt=""')
    expect(html).toContain('size-6')
    expect(html).toContain('rounded-[4px]')
    expect(html).toContain('object-cover')
  })
  test('なければ、何も入れない(img も、アイコンの svg も出ない)。同じ 24×24 の空きだけを残す(名前の位置が、行ごとにそろう)', () => {
    for (const none of [null, undefined, '']) {
      const html = renderToStaticMarkup(createElement(ProductAvatar, { src: none, name: 'A' }))
      expect(html).not.toContain('<img')
      expect(html).not.toContain('<svg')
      expect(html).toMatch(/^<span aria-hidden="true" data-avatar-fallback="true" class="size-6 shrink-0"><\/span>$/)
    }
  })
})
