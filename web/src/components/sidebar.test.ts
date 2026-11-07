import { describe, expect, test } from 'bun:test'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { Sidebar, type SidebarProduct } from './sidebar'

const render = (products: SidebarProduct[]) =>
  renderToStaticMarkup(
    createElement(
      QueryClientProvider,
      { client: new QueryClient() },
      createElement(Sidebar, { products }),
    ),
  )

describe('Sidebar のプロダクトの行とアイコン', () => {
  const leader = { id: 'a', name: 'リーダーの', isLeader: true, avatarUrl: 'https://x/a.png' }
  const member = { id: 'b', name: 'メンバーの', isLeader: false, avatarUrl: null }

  test('リーダーの行にだけ、アイコンのボタンと隠しの input がある', () => {
    const html = render([leader, member])
    expect(html.match(/aria-label="「[^」]*」のアイコンを変更"/g)).toEqual([
      'aria-label="「リーダーの」のアイコンを変更"',
    ])
    expect(html.match(/type="file"/g)).toHaveLength(1)
    expect(html).toContain('accept="image/png,image/jpeg,image/gif,image/webp"')
  })

  test('メンバーの行には、ボタンも input もない(アイコンは見るだけ)', () => {
    const html = render([member])
    expect(html).not.toContain('のアイコンを変更')
    expect(html).not.toContain('type="file"')
    expect(html).toContain('data-avatar-fallback')
  })

  test('画像があれば img、行の高さ h-12 は残り、li は relative', () => {
    const html = render([leader])
    expect(html).toContain('src="https://x/a.png"')
    expect(html).toContain('<li class="relative">')
    expect(html).toContain('flex h-12 w-full items-center')
  })

  test('button の入れ子はない', () => {
    const html = render([leader])
    expect(html).not.toMatch(/<button[^>]*>(?:(?!<\/button>).)*<button/s)
    expect(html).toContain('aria-busy="false"')
  })
})
