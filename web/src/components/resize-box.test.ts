import { describe, expect, test } from 'bun:test'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { ResizeBox, RESIZE_MS } from './resize-box'
import { Modal } from './modal'

// 高さの変化を動かす箱の、構造と使う条件のスモークテスト(DOM なし。実際の測定と動きは、ブラウザでしか出ない)

describe('ResizeBox', () => {
  const html = renderToStaticMarkup(createElement(ResizeBox, null, createElement('p', null, '中身')))
  test('外側の箱(高さを動かす)の中に、中身を包む箱がある。最初は、高さを固定しない(auto)', () => {
    expect(html).toMatch(/^<div data-resize-box="" style="height:auto"><div><p>中身<\/p><\/div><\/div>$/)
  })
  test('最初は、動かさない(transition も、はみ出しの隠しも付かない)', () => {
    expect(html).not.toContain('transition')
    expect(html).not.toContain('overflow')
  })
  test('動きの時間は、詳細の中身の動き(0.18 秒)と同じ', () => {
    expect(RESIZE_MS).toBe(180)
  })
})

describe('Modal の animateResize', () => {
  const render = (props: Record<string, unknown>) =>
    renderToStaticMarkup(createElement(Modal, { open: true, onClose: () => {}, ...props } as never, createElement('p', null, 'x')))
  test('既定では、使わない(中身は、そのまま)', () => {
    expect(render({})).not.toContain('data-resize-box')
  })
  test('animateResize を渡すと、中身を ResizeBox で包む', () => {
    expect(render({ animateResize: true })).toContain('data-resize-box')
  })
  test('画面いっぱいのモーダル(size="full")と、はみ出させるモーダル(overflowVisible)では、使わない', () => {
    expect(render({ animateResize: true, size: 'full' })).not.toContain('data-resize-box')
    expect(render({ animateResize: true, overflowVisible: true })).not.toContain('data-resize-box')
  })
})
