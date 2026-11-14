import { describe, expect, test } from 'bun:test'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { hasPendingReview, ReviewDot, withReviewLabel } from './review-dot'
import { Sidebar, type SidebarProduct } from './sidebar'
import { SidebarRail } from './sidebar-rail'

// 確認待ちがあるプロダクトに、赤い点(サイドバーの行・たたんだ帯のアイコン)

describe('hasPendingReview / withReviewLabel', () => {
  test('1 件以上のときだけ。null(メンバーのプロダクト)・未指定・0 は、なし', () => {
    expect(hasPendingReview(1)).toBe(true)
    for (const none of [0, null, undefined]) expect(hasPendingReview(none)).toBe(false)
  })
  test('読み上げの名前に、件数を足す。なければ名前のまま', () => {
    expect(withReviewLabel('Alpha', 2)).toBe('Alpha(確認待ち 2 件)')
    expect(withReviewLabel('Alpha', 0)).toBe('Alpha')
    expect(withReviewLabel('Alpha', null)).toBe('Alpha')
  })
})

describe('ReviewDot の動き', () => {
  const html = renderToStaticMarkup(createElement(ReviewDot, { className: 'absolute top-1 right-1' }))
  test('輪が広がって消える動き(review-ping)がある。点は強い赤', () => {
    expect(html).toContain('review-ping')
    expect(html).toContain('bg-red-600')
  })
  test('置き場所(className)は外側に付く。点は 1 つだけ数えられ、読み上げない', () => {
    expect(html).toMatch(/^<span aria-hidden="true" class="[^"]*absolute top-1 right-1/)
    expect(html.match(/data-review-dot/g)?.length).toBe(1)
  })
})

const products: SidebarProduct[] = [
  { id: 'a', name: '確認あり', isLeader: true, pendingReviewCount: 2 },
  { id: 'b', name: '確認なし', isLeader: true, pendingReviewCount: 0 },
  { id: 'c', name: 'メンバー', isLeader: false, pendingReviewCount: null },
]

describe('サイドバーの行', () => {
  const html = renderToStaticMarkup(createElement(QueryClientProvider, { client: new QueryClient() }, createElement(Sidebar, { products })))
  test('確認待ちのあるプロダクトの行にだけ、赤い点が出る', () => {
    expect(html.match(/data-review-dot/g)?.length).toBe(1)
    expect(html).toContain('bg-red-600')
  })
  test('点のある行は、読み上げの名前に件数が付く。点のない行は付かない', () => {
    expect(html).toContain('aria-label="確認あり(確認待ち 2 件)"')
    expect(html).not.toContain('確認なし(確認待ち')
  })
})

describe('たたんだ帯のアイコン', () => {
  const html = renderToStaticMarkup(createElement(SidebarRail, { products, collapsed: true, onExpand: () => {} }))
  test('確認待ちのあるプロダクトのアイコンにだけ、赤い点。名前に件数が付く', () => {
    expect(html.match(/data-review-dot/g)?.length).toBe(1)
    expect(html).toContain('aria-label="確認あり(確認待ち 2 件)"')
    expect(html).toContain('title="確認あり(確認待ち 2 件)"')
    expect(html).toContain('aria-label="メンバー"')
  })
})
