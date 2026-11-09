import { describe, expect, test } from 'bun:test'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { MarkdownView } from './markdown-view'

const render = (source: string) => renderToStaticMarkup(createElement(MarkdownView, { source }))

describe('MarkdownView(安全)', () => {
  test('生の HTML は、要素にならず、エスケープされた文字になる(script・iframe・onerror)', () => {
    const html = render('<script>alert(1)</script>\n\n<iframe src="https://evil.example"></iframe>\n\n<img src=x onerror=alert(1)>')
    expect(html).not.toContain('<script')
    expect(html).not.toContain('<iframe')
    expect(html).not.toContain('<img')
    expect(html).toContain('&lt;script&gt;alert(1)&lt;/script&gt;')
    expect(html).toContain('&lt;img src=x onerror=alert(1)&gt;')
  })
  test('画像は読み込まない(img 要素を作らない)。安全な URL ならリンクになる', () => {
    const html = render('![図](https://example.com/a.png)')
    expect(html).not.toContain('<img')
    expect(html).toContain('<a ')
    expect(html).toContain('href="https://example.com/a.png"')
  })
  test('javascript: / data: のリンクは、リンクにならない(href が出ない)', () => {
    const html = render('[悪い](javascript:alert(1)) と [これも](data:text/html,x) と [//evil](//evil.example)')
    expect(html).not.toContain('href=')
    expect(html).not.toContain('javascript:')
  })
  test('リンクは別のタブで開き、参照元を渡さない(rel)', () => {
    const html = render('[公式](https://example.com)')
    expect(html).toContain('target="_blank"')
    expect(html).toContain('rel="noopener noreferrer nofollow"')
  })
  test('コードブロックの中の HTML も、ただの文字', () => {
    const html = render('```html\n<script>alert(1)</script>\n```')
    expect(html).toContain('<pre')
    expect(html).toContain('&lt;script&gt;')
    expect(html).not.toContain('<script')
  })
})

describe('MarkdownView(表示)', () => {
  test('見出し・段落・太字・コード', () => {
    const html = render('# 見出し\n\n本文の**太字**と`code`')
    expect(html).toContain('<h1')
    expect(html).toContain('見出し</h1>')
    expect(html).toContain('<strong')
    expect(html).toContain('<code')
  })
  test('箇条書き・番号つき(開始の番号)・入れ子', () => {
    const html = render('- a\n  - b\n\n3. c')
    expect(html).toContain('<ul')
    expect(html.match(/<ul/g)?.length).toBe(2)
    expect(html).toContain('<ol')
    expect(html).toContain('start="3"')
  })
  test('チェックリストは、押せないチェックボックス(disabled)', () => {
    const html = render('- [x] 済\n- [ ] 未')
    expect(html.match(/<input/g)?.length).toBe(2)
    expect(html.match(/disabled=""/g)?.length).toBe(2)
    expect(html).toContain('checked=""')
  })
  test('表: 見出し(th)と行(td)、位置', () => {
    const html = render('| 名前 | 数 |\n| :--- | ---: |\n| a | 1 |')
    expect(html).toContain('<table')
    expect(html.match(/<th[ >]/g)?.length).toBe(2)
    expect(html).toContain('<td')
    expect(html).toContain('text-right')
  })
  test('引用・区切り線', () => {
    const html = render('> 引用\n\n---')
    expect(html).toContain('<blockquote')
    expect(html).toContain('<hr')
  })
  test('空なら「(内容がありません)」', () => {
    expect(render('')).toContain('(内容がありません)')
    expect(render('  \n ')).toContain('(内容がありません)')
  })
})
