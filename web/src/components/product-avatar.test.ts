import { describe, expect, test } from 'bun:test'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { ProductAvatar } from './product-avatar'

const render = (src: string | null) => renderToStaticMarkup(createElement(ProductAvatar, { src, name: 'A' }))

describe('ProductAvatar', () => {
  test('avatarUrl があれば img(18×18、角丸 4px、alt は空)', () => {
    const html = render('https://example.com/a.png')
    expect(html).toContain('<img')
    expect(html).toContain('src="https://example.com/a.png"')
    expect(html).toContain('alt=""')
    expect(html).toContain('size-[18px]')
    expect(html).toContain('rounded-[4px]')
    expect(html).toContain('object-cover')
  })
  test('なければ、代わりのアイコン(img は出ない)', () => {
    const html = render(null)
    expect(html).not.toContain('<img')
    expect(html).toContain('<svg')
    expect(html).toContain('size-[18px]')
  })
})
