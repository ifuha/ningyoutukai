import { describe, expect, test } from 'bun:test'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { REPORT_MAX_LENGTH, ReportDraftCard, ReportDrafts, readDocumentsText } from './report-drafts'
import type { ReportDraft } from '#/lib/document-api'

// AI の報告の下書き(担当者が確認して、完了報告に出す)

const draft = (over: Partial<ReportDraft> = {}): ReportDraft => ({
  draftId: 'd1',
  taskId: 't1',
  aiName: 'Claude Code',
  body: '# 結果\n\n実装しました\n\n<script>alert(1)</script>',
  readDocuments: [
    { documentId: 'a', name: '仕様/spec.md', version: 2 },
    { documentId: 'b', name: '設計/api.md', version: 3 },
  ],
  status: 'pending',
  createdAt: '2030-01-01T09:00:00.000Z',
  decidedAt: null,
  ...over,
})
const render = (props: Partial<Parameters<typeof ReportDraftCard>[0]> = {}) =>
  renderToStaticMarkup(createElement(ReportDraftCard, { draft: draft(), onAdopt: () => {}, onDiscard: () => {}, ...props }))

describe('ReportDraftCard', () => {
  test('AI の名前、読んだ文書(名前と版)、本文(Markdown の表示)が出る', () => {
    const html = render()
    expect(html).toContain('AI「Claude Code」の下書き')
    expect(html).toContain('読んだ文書: 仕様/spec.md(版 2)、設計/api.md(版 3)')
    expect(html).toContain('<h1')
    expect(html).toContain('実装しました')
  })
  test('本文の中の HTML は、実行されず、ただの文字(script は要素にならない)', () => {
    const html = render()
    expect(html).not.toContain('<script')
    expect(html).toContain('&lt;script&gt;alert(1)&lt;/script&gt;')
  })
  test('読んだ文書がなければ、その行は出ない', () => {
    expect(render({ draft: draft({ readDocuments: [] }) })).not.toContain('読んだ文書')
  })
  test('操作は 3 つ: このまま報告に出す / 直して出す / 却下。最初は入力欄がない', () => {
    const html = render()
    for (const label of ['このまま報告に出す', '直して出す', '却下']) expect(html).toContain(`aria-label="${label}"`)
    expect(html).not.toContain('<textarea')
  })
  test('処理中は、3 つとも押せない。エラーは、カードの中に出る', () => {
    const html = render({ pending: true, error: '失敗しました' })
    expect(html.match(/disabled=""/g)?.length).toBe(3)
    expect(html).toContain('ERR 失敗しました')
  })
  test('readDocumentsText: 読点でつなぐ', () => {
    expect(readDocumentsText(draft())).toBe('仕様/spec.md(版 2)、設計/api.md(版 3)')
    expect(readDocumentsText(draft({ readDocuments: [] }))).toBe('')
  })
  test('上限は 10000 文字(api と同じ)', () => {
    expect(REPORT_MAX_LENGTH).toBe(10000)
  })
})

describe('ReportDrafts', () => {
  test('下書きを取得するまで(または、なければ)、何も出さない(AI を使っていない人の画面を、変えない)', () => {
    const html = renderToStaticMarkup(
      createElement(QueryClientProvider, { client: new QueryClient() }, createElement(ReportDrafts, { productId: 'p', taskId: 't', onAdopted: () => {} })),
    )
    expect(html).toBe('')
  })
})
