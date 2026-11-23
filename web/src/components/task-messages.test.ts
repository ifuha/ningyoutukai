import { describe, expect, test } from 'bun:test'
import { createElement } from 'react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { renderToStaticMarkup } from 'react-dom/server'
import { TaskMessages, messageMenuItems } from './task-messages'
import { visibleMenuItems } from '#/lib/context-menu-items'

/** `GET …/message` の応答 1 件(api の応答と同じ形) */
const message = (patch: Record<string, unknown> = {}) => ({
  messageId: 'msg-1',
  kind: 'comment' as const,
  body: '確認をお願いします',
  author: { productMemberId: 'm1', userName: '担当者', avatarUrl: null },
  createdAt: '2026-11-19T00:00:00.000Z',
  editedAt: null,
  deleted: false,
  canEdit: true,
  canDelete: true,
  reactions: [] as unknown[],
  ...patch,
})

/** データを入れた QueryClient を作り、やりとりの欄を描画する */
const render = (
  messages: unknown[],
  props: Partial<Parameters<typeof TaskMessages>[0]> = {},
) => {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  client.setQueryData(['products', 'p1', 'task', 't1', 'messages'], { messages })
  return renderToStaticMarkup(
    createElement(
      QueryClientProvider,
      { client },
      createElement(TaskMessages, {
        productId: 'p1',
        taskId: 't1',
        canComment: true,
        reactable: true,
        viewerMemberId: 'm2',
        ...props,
      }),
    ),
  )
}

const reaction = (emoji: string, members: { productMemberId: string; userName: string }[]) => ({
  emoji,
  members: members.map((m) => ({ ...m, avatarUrl: null })),
})

describe('TaskMessages のリアクション', () => {
  test('押した人の一覧を、絵文字ごとにまとめて件数つきで出す', () => {
    const html = render([
      message({
        reactions: [
          reaction('👍', [
            { productMemberId: 'm1', userName: '担当者' },
            { productMemberId: 'm3', userName: 'リーダー' },
          ]),
          reaction('🎉', [{ productMemberId: 'm3', userName: 'リーダー' }]),
        ],
      }),
    ])
    expect(html).toContain('👍')
    expect(html).toContain('🎉')
    // 件数
    expect(html).toMatch(/👍<\/span><span>2</)
    expect(html).toMatch(/🎉<\/span><span>1</)
    // 押した人の名前は、押す前に分かるよう title に入れる
    expect(html).toContain('title="担当者、リーダー"')
  })

  test('自分のリアクションには印を付ける(押すと外せる)', () => {
    const html = render([
      message({
        reactions: [reaction('👍', [{ productMemberId: 'm2', userName: '自分' }])],
      }),
    ])
    expect(html).toContain('ring-1 ring-ink')
    expect(html).toContain('自分')
    expect(html).toContain('押すと外れます')
  })

  test('押せる人だけ顔マークを出す。それ以外は、付いている絵文字だけ表示する', () => {
    const messages = [
      message({ reactions: [reaction('👀', [{ productMemberId: 'm1', userName: '担当者' }])] }),
    ]
    expect(render(messages)).toContain('aria-label="リアクションを追加"')
    expect(render(messages)).toContain('lucide-smile-plus')
    // 完了済み(reactable なし)では付けられないが、付いているものは見える
    const readonly = render(messages, { reactable: false })
    expect(readonly).not.toContain('aria-label="リアクションを追加"')
    expect(readonly).toContain('👀')
  })

  test('何も押されておらず、押せないときは絵文字の欄自体を出さない', () => {
    const html = render([message()], { reactable: false })
    expect(html).not.toContain('リアクションを追加')
  })

  test('削除済みのメッセージは、一覧に出さない(絵文字も出ない)', () => {
    const html = render(
      [
        message({
          deleted: true,
          body: '',
          reactions: [reaction('👍', [{ productMemberId: 'm1', userName: '担当者' }])],
        }),
        message({ messageId: 'm2', body: '残るコメント' }),
      ],
      { reactable: false },
    )
    expect(html).toContain('残るコメント')
    expect(html).not.toContain('削除されました')
    expect(html).not.toContain('👍')
  })

  test('すべて削除済みなら、「やりとりはまだありません」を出す', () => {
    const html = render([message({ deleted: true, body: '' })])
    expect(html).toContain('やりとりはまだありません')
  })
})

describe('右クリック(コンテキストメニュー)の項目', () => {
  const labels = (canEdit: boolean, canDelete: boolean) =>
    visibleMenuItems(messageMenuItems({ canEdit, canDelete }, { onEdit: () => {}, onDelete: () => {} })).map(
      (item) => item.label,
    )

  test('編集できるものだけ「編集」、削除できるものだけ「削除」を出す', () => {
    expect(labels(true, true)).toEqual(['編集', '削除'])
    expect(labels(true, false)).toEqual(['編集'])
    expect(labels(false, true)).toEqual(['削除'])
    expect(labels(false, false)).toEqual([])
  })

  test('選ぶと、渡した操作を呼ぶ', () => {
    const called: string[] = []
    const items = messageMenuItems(
      { canEdit: true, canDelete: true },
      { onEdit: () => called.push('編集'), onDelete: () => called.push('削除') },
    )
    visibleMenuItems(items).forEach((item) => item.onSelect())
    expect(called).toEqual(['編集', '削除'])
  })

  test('編集か削除ができるメッセージには、右クリックが使えない人のための「…」ボタンを出す', () => {
    expect(render([message()])).toContain('aria-label="メッセージの操作"')
    expect(render([message({ canEdit: false, canDelete: true })])).toContain('aria-label="メッセージの操作"')
  })

  test('どちらもできないメッセージと、削除済みのメッセージには、「…」ボタンを出さない', () => {
    expect(render([message({ canEdit: false, canDelete: false })])).not.toContain('aria-label="メッセージの操作"')
    expect(render([message({ deleted: true })])).not.toContain('aria-label="メッセージの操作"')
  })
})

describe('投稿者と日付', () => {
  test('投稿者のアイコンを、本文の左に出す(画像がなければ名前の頭文字)', () => {
    const fallback = render([message()])
    expect(fallback).toContain('>担</span>')
    const withImage = render([
      message({
        author: {
          productMemberId: 'm1',
          userName: '担当者',
          avatarUrl: 'https://example.com/a.png',
        },
      }),
    ])
    expect(withImage).toContain('src="https://example.com/a.png"')
  })

  test('今日・昨日はその語で、それより前は日付と時刻で出す', () => {
    const now = new Date()
    expect(render([message({ createdAt: now.toISOString() })])).toContain('今日 ')
    const yesterday = new Date(now.getTime() - 24 * 60 * 60 * 1000)
    expect(render([message({ createdAt: yesterday.toISOString() })])).toContain('昨日 ')
    expect(render([message({ createdAt: '2020-01-02T03:04:00.000Z' })])).toContain(
      '2020/1/2 12:04',
    )
  })

  test('名前・種類・日時を、1 行の見出しに出す(日時は全体を title にも入れる)', () => {
    const html = render([message({ kind: 'report' })])
    expect(html).toContain('担当者')
    expect(html).toContain('完了報告')
    expect(html).toContain('title="2026/11/19 09:00"')
  })
})
