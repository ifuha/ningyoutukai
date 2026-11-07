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

  test('リーダーの行にだけ、メニューを開く目印(aria-haspopup)と、隠しの input がある', () => {
    const html = render([leader, member])
    expect(html.match(/aria-haspopup="menu"/g)).toHaveLength(1)
    expect(html.match(/type="file"/g)).toHaveLength(1)
    expect(html).toContain('accept="image/png,image/jpeg,image/gif,image/webp"')
    // 行を押してアイコンを変える動きはなくなった
    expect(html).not.toContain('のアイコンを変更')
  })

  test('メンバーの行には、目印も input もない(アイコンは見るだけ)', () => {
    const html = render([member])
    expect(html).not.toContain('aria-haspopup')
    expect(html).not.toContain('type="file"')
    expect(html).not.toContain('select-none')
    expect(html).not.toContain('touch-callout')
    expect(html).toContain('data-avatar-fallback')
  })

  test('リーダーの行は、長押しで文字が選択されず、iOS の標準メニューも出ない', () => {
    const html = render([leader])
    expect(html).toContain('select-none')
    expect(html).toContain('[-webkit-touch-callout:none]')
  })

  test('アイコンは押せない表示(button でない)。画像があれば img', () => {
    const html = render([leader])
    expect(html).toContain('src="https://x/a.png"')
    // button は行の 1 つだけ(下の「プロダクト作成」「設定」のボタンは別)
    const row = html.slice(html.indexOf('<li class="relative">'), html.indexOf('</li>', html.indexOf('<li class="relative">')))
    expect(row.match(/<button/g)).toHaveLength(1)
    expect(row.indexOf('<img')).toBeLessThan(row.indexOf('<button'))
  })

  test('行の高さ h-12 は残り、li は relative。アイコンは左 3px・上下中央', () => {
    for (const html of [render([leader]), render([member])]) {
      expect(html).toContain('<li class="relative">')
      expect(html).toContain('flex h-12 w-full items-center truncate')
      expect(html).toContain('pl-[29px]')
      expect(html).toContain('pointer-events-none absolute top-0 left-[3px] flex h-12 items-center')
    }
  })

  test('button の入れ子はない', () => {
    const html = render([leader, member])
    expect(html).not.toMatch(/<button[^>]*>(?:(?!<\/button>).)*<button/s)
  })

  test('メニューは、開くまで描かない(role="menu" がない)', () => {
    expect(render([leader])).not.toContain('role="menu"')
  })
})
