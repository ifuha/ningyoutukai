import { describe, expect, test } from 'bun:test'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { DocumentDialog } from './document-dialog'
import { DocumentsPanelView, type DocumentsPanelViewProps } from './documents-panel'
import { LockNoticeBanner } from './lock-notice'
import { NewDocumentDialog } from './new-document-dialog'
import type { DocDirectory } from '#/lib/document-api'
import { lockNotice } from '#/lib/document-tree'
import { heldState } from '#/lib/edit-lock'

// 右側のツリー(緑の点と名前)・ロックの案内・文書を追加するダイアログ

const doc = (over: Partial<DocDirectory['documents'][number]> & { documentId: string; name: string }): DocDirectory['documents'][number] => ({
  directoryId: 'd1',
  currentVersion: 2,
  sizeBytes: 10,
  keepForever: false,
  lastFetchedAt: null,
  updatedAt: '2030-01-01T00:00:00.000Z',
  editingBy: null,
  ...over,
})
const dir = (over: Partial<DocDirectory> & { directoryId: string; name: string }): DocDirectory => ({
  myLevel: 'read',
  createdAt: '2030-01-01T00:00:00.000Z',
  documents: [],
  ...over,
})

const props = (over: Partial<DocumentsPanelViewProps> = {}): DocumentsPanelViewProps => ({
  directories: [],
  myMemberId: 'me',
  isLeader: false,
  onClose: () => {},
  onOpenDocument: () => {},
  onAddDocument: () => {},
  ...over,
})
const render = (over: Partial<DocumentsPanelViewProps> = {}) => renderToStaticMarkup(createElement(DocumentsPanelView, props(over)))

describe('右側のツリー', () => {
  test('ディレクトリと文書が並ぶ。文書は版つき。自動削除しない文書には印', () => {
    const html = render({
      directories: [dir({ directoryId: 'd1', name: '仕様', documents: [doc({ documentId: 'a', name: 'spec.md' }), doc({ documentId: 'b', name: 'keep.md', keepForever: true, currentVersion: 5 })] })],
    })
    expect(html).toContain('aria-label="文書"')
    expect(html).toContain('仕様')
    expect(html).toContain('spec.md')
    expect(html).toContain('v2')
    expect(html).toContain('v5')
    expect(html).toContain('title="自動削除しない"')
  })

  test('編集中の文書には、緑の点と、編集している人の名前が出る。編集していない文書には出ない', () => {
    const html = render({
      directories: [
        dir({
          directoryId: 'd1',
          name: '仕様',
          documents: [
            doc({ documentId: 'a', name: 'busy.md', editingBy: { memberId: 'm2', userName: '田中' } }),
            doc({ documentId: 'b', name: 'mine.md', editingBy: { memberId: 'me', userName: '私' } }),
            doc({ documentId: 'c', name: 'free.md' }),
          ],
        }),
      ],
    })
    expect(html.match(/data-editing=""/g)?.length).toBe(2)
    expect(html).toContain('bg-green-500')
    expect(html).toContain('田中 さんが編集中')
    expect(html).toContain('自分が編集中')
    // free.md の項目には、編集中の表示がない
    const free = html.slice(html.indexOf('free.md'))
    expect(free).not.toContain('data-editing')
  })

  test('開いている文書は、aria-current。文書がなければ「# 文書なし」', () => {
    const html = render({ activeDocumentId: 'a', directories: [dir({ directoryId: 'd1', name: '仕様', documents: [doc({ documentId: 'a', name: 'spec.md' })] }), dir({ directoryId: 'd2', name: '空' })] })
    expect(html).toContain('aria-current="true"')
    expect(html).toContain('# 文書なし')
  })

  test('書き込み権限のあるディレクトリにだけ「文書を追加」。メンバーには、ディレクトリの管理ボタンが出ない', () => {
    const html = render({
      directories: [dir({ directoryId: 'd1', name: '書ける', myLevel: 'write' }), dir({ directoryId: 'd2', name: '読むだけ', myLevel: 'read' })],
    })
    expect(html.match(/aria-label="文書を追加"/g)?.length).toBe(1)
    for (const label of ['ディレクトリを追加', 'ディレクトリを削除', '名前を変える', 'aria-label="権限"']) expect(html).not.toContain(label)
  })

  test('リーダーには、ディレクトリの追加・名前の変更・削除・権限のボタンが出る', () => {
    const html = render({
      isLeader: true,
      onAddDirectory: async () => {},
      onRenameDirectory: async () => {},
      onDeleteDirectory: async () => {},
      onOpenPermissions: () => {},
      directories: [dir({ directoryId: 'd1', name: '仕様', myLevel: 'write' })],
    })
    for (const label of ['ディレクトリを追加', 'ディレクトリを削除', '名前を変える', '権限', '文書を追加']) expect(html).toContain(`aria-label="${label}"`)
  })

  test('ディレクトリがなければ案内。リーダーには作り方も出る。読み込み中・エラーも出る', () => {
    expect(render({ directories: [] })).toContain('ディレクトリはまだありません')
    expect(render({ directories: [] })).not.toContain('ディレクトリを追加')
    expect(render({ directories: [], isLeader: true, onAddDirectory: async () => {} })).toContain('「ディレクトリを追加」から作れます')
    expect(render({ directories: undefined, loading: true })).toContain('読み込み中')
    expect(render({ directories: undefined, error: '失敗' })).toContain('ERR 失敗')
  })
})

describe('編集ロックの案内', () => {
  const NOW = 1_000_000_000_000
  const render = (state: Parameters<typeof lockNotice>[0], onReacquire = () => {}) => renderToStaticMarkup(createElement(LockNoticeBanner, { notice: lockNotice(state, NOW), onReacquire }))

  test('案内がなければ何も出ない', () => {
    expect(render({ kind: 'off' })).toBe('')
    expect(render(heldState({ idleMsLeft: 30 * 60 * 1000, warnBeforeMs: 60_000 }, NOW))).toBe('')
  })
  test('解除の 1 分前: 警告(alert)で、あと何秒かを出す', () => {
    const html = render(heldState({ idleMsLeft: 42_000, warnBeforeMs: 60_000 }, NOW))
    expect(html).toContain('role="alert"')
    expect(html).toContain('data-lock-notice="warn"')
    expect(html).toContain('あと 42 秒で編集ロックが解除されます')
  })
  test('他の人が編集中: 状態の知らせ(status)で、名前を出す。取り直しボタンはない', () => {
    const html = render({ kind: 'taken', by: '田中' })
    expect(html).toContain('role="status"')
    expect(html).toContain('田中 さんが編集中です')
    expect(html).not.toContain('ロックを取り直す')
  })
  test('外れた: 「ロックが解除されました」と、入力した内容が残ること。「ロックを取り直す」ボタン', () => {
    const html = render({ kind: 'released' })
    expect(html).toContain('role="alert"')
    expect(html).toContain('編集ロックが解除されました')
    expect(html).toContain('入力した内容は残っています')
    expect(html).toContain('ロックを取り直す')
  })
})

describe('ダイアログ', () => {
  test('文書を追加するダイアログは、閉じている間は中身を置かない', () => {
    const html = renderToStaticMarkup(createElement(NewDocumentDialog, { open: false, directoryName: '仕様', onSubmit: async () => {}, onClose: () => {} }))
    expect(html).not.toContain('文書を追加')
  })
  test('文書のダイアログも、文書を選ぶまでは中身を置かない', () => {
    const html = renderToStaticMarkup(createElement(DocumentDialog, { productId: 'p', documentId: null, isLeader: true, myMemberId: 'me', onClose: () => {} }))
    expect(html).not.toContain('編集')
    expect(html).not.toContain('履歴')
  })
})
