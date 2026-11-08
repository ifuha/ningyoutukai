import { describe, expect, test } from 'bun:test'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { DocumentsFeature } from './documents-feature'
import { PanelResizeHandle } from './panel-resize-handle'

const handle = (width = 400) => renderToStaticMarkup(createElement(PanelResizeHandle, { width, onChange: () => {}, onCommit: () => {}, onReset: () => {} }))

describe('PanelResizeHandle', () => {
  test('縦の区切り(separator)として、いまの幅と範囲を伝える。キーボードで触れる(tabIndex 0)', () => {
    const html = handle(420)
    expect(html).toContain('role="separator"')
    expect(html).toContain('aria-orientation="vertical"')
    expect(html).toContain('aria-valuenow="420"')
    expect(html).toContain('aria-valuemin="280"')
    expect(html).toContain('aria-valuemax="900"')
    expect(html).toContain('tabindex="0"')
  })
  test('広い画面だけに出す(hidden md:block)。スマホは全面なので出さない。カーソルは左右の矢印', () => {
    const html = handle()
    expect(html).toContain('hidden')
    expect(html).toContain('md:block')
    expect(html).toContain('cursor-col-resize')
  })
  test('操作の仕方を、名前(aria-label)で伝える', () => {
    const html = handle()
    expect(html).toContain('左右にドラッグ')
    expect(html).toContain('ダブルクリックで元に戻す')
  })
})

describe('DocumentsFeature の幅', () => {
  const render = (open: boolean) =>
    renderToStaticMarkup(
      createElement(
        QueryClientProvider,
        { client: new QueryClient() },
        createElement(DocumentsFeature, { productId: 'p', open, isLeader: true, myMemberId: 'me', onClose: () => {} }),
      ),
    )
  test('開いているとき、パネルに幅(--docs-width)とつまみがある。広い画面でだけ、その幅になる(md:w-[var(--docs-width)])', () => {
    const html = render(true)
    expect(html).toContain('data-documents-panel')
    expect(html).toContain('--docs-width:352px')
    expect(html).toContain('md:w-[var(--docs-width)]')
    expect(html).toContain('data-panel-resize')
    // スマホは全面(inset-0)のまま
    expect(html).toContain('inset-0')
  })
  test('広い画面では、浮かせたカード: 右・下に 12px の余白、上は見出しのボタンの下を空ける。影がつく。端に付いた全高のパネルではない', () => {
    const html = render(true)
    expect(html).toContain('md:inset-auto')
    expect(html).toContain('md:top-16')
    expect(html).toContain('md:right-3')
    expect(html).toContain('md:bottom-3')
    expect(html).toContain('md:drop-shadow-xl')
    // 以前の、右端に付いて全高の形(left-auto)ではない
    expect(html).not.toContain('md:left-auto')
  })
  test('閉じているときは、パネルもつまみも出ない', () => {
    const html = render(false)
    expect(html).not.toContain('data-documents-panel')
    expect(html).not.toContain('data-panel-resize')
  })
})
