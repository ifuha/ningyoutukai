import { describe, expect, test } from 'bun:test'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { TaskDocumentPicker, handedCount, sameSelection, toggleDirectory, toggleDocument, type TaskLinkSelection } from './task-document-picker'
import type { DocDirectory } from '#/lib/document-api'

// タスクの作成・編集のフォームで、渡す Markdown を選ぶ部品

const doc = (id: string, name: string) => ({ documentId: id, name }) as DocDirectory['documents'][number]
const dir = (id: string, name: string, docs: [string, string][]): DocDirectory => ({ directoryId: id, name, myLevel: 'read', createdAt: '', documents: docs.map(([i, n]) => doc(i, n)) })
const spec = dir('d1', '仕様', [['a', 'spec.md'], ['b', 'api.md']])
const guide = dir('d2', '手順', [['c', 'guide.md']])
const none: TaskLinkSelection = { documentIds: [], directoryIds: [] }

describe('選択の切り替え(純粋関数)', () => {
  test('ディレクトリを選ぶと、その中の個別の選択は外れる(重ねて持たない)。もう一度で外れる', () => {
    const sel = toggleDirectory({ documentIds: ['a', 'c'], directoryIds: [] }, spec)
    expect(sel).toEqual({ documentIds: ['c'], directoryIds: ['d1'] })
    expect(toggleDirectory(sel, spec)).toEqual({ documentIds: ['c'], directoryIds: [] })
  })
  test('文書を個別に選ぶ・外す', () => {
    const sel = toggleDocument(none, 'a')
    expect(sel).toEqual({ documentIds: ['a'], directoryIds: [] })
    expect(toggleDocument(sel, 'a')).toEqual(none)
  })
  test('渡される文書の数: ディレクトリ経由と個別の重なりは 1 件', () => {
    expect(handedCount(none, [spec, guide])).toBe(0)
    expect(handedCount({ documentIds: ['a', 'c'], directoryIds: ['d1'] }, [spec, guide])).toBe(3)
    expect(handedCount({ documentIds: ['c'], directoryIds: [] }, [spec, guide])).toBe(1)
  })
  test('同じ選択か(順番は問わない)', () => {
    expect(sameSelection({ documentIds: ['a', 'b'], directoryIds: ['d1'] }, { documentIds: ['b', 'a'], directoryIds: ['d1'] })).toBe(true)
    expect(sameSelection({ documentIds: ['a'], directoryIds: [] }, { documentIds: ['a', 'b'], directoryIds: [] })).toBe(false)
    expect(sameSelection(none, none)).toBe(true)
  })
})

const render = (over: Partial<Parameters<typeof TaskDocumentPicker>[0]> = {}) =>
  renderToStaticMarkup(createElement(TaskDocumentPicker, { directories: [spec, guide], selection: none, onChange: () => {}, ...over }))

describe('TaskDocumentPicker', () => {
  test('ディレクトリごとのチェックと、中の文書のチェックが並ぶ。説明が付く', () => {
    const html = render()
    expect(html).toContain('渡す Markdown')
    expect(html).toContain('ディレクトリで渡すと、中の文書すべて(あとから足した文書も)が渡ります')
    expect(html).toContain('aria-label="仕様 をディレクトリごと渡す"')
    expect(html).toContain('aria-label="仕様/spec.md"')
    expect(html).toContain('aria-label="手順/guide.md"')
    expect(html).toContain('ディレクトリごと(2)')
  })
  test('ディレクトリを選ぶと、中の文書は「ディレクトリで渡す」のチェック済みで、個別には外せない', () => {
    const html = render({ selection: { documentIds: [], directoryIds: ['d1'] } })
    const inSpec = html.slice(html.indexOf('仕様/spec.md'), html.indexOf('手順 をディレクトリごと'))
    expect(inSpec).toContain('checked=""')
    expect(inSpec).toContain('disabled=""')
    expect(html.match(/\(ディレクトリで渡す\)/g)?.length).toBe(2)
    expect(html).toContain('2 件')
  })
  test('個別に選んだ文書だけがチェックされる。件数が出る', () => {
    const html = render({ selection: { documentIds: ['c'], directoryIds: [] } })
    expect(html).toContain('1 件')
    expect(html.match(/checked=""/g)?.length).toBe(1)
  })
  test('ディレクトリがなければ、作り方の案内。読み込み中・エラーも出る', () => {
    expect(render({ directories: [] })).toContain('文書がありません')
    expect(render({ directories: undefined, loading: true })).toContain('読み込み中')
    expect(render({ directories: undefined, error: '失敗' })).toContain('ERR 失敗')
  })
  test('保存中(disabled)は、フィールドセットごと押せない', () => {
    expect(render({ disabled: true })).toMatch(/<fieldset[^>]*disabled=""/)
  })
})
