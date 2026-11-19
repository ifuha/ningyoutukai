import { describe, expect, test } from 'bun:test'
import { createElement } from 'react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { renderToStaticMarkup } from 'react-dom/server'
import { TaskMessages } from './task-messages'

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

  test('押せる人だけ「＋」を出す。それ以外は、付いている絵文字だけ表示する', () => {
    const messages = [
      message({ reactions: [reaction('👀', [{ productMemberId: 'm1', userName: '担当者' }])] }),
    ]
    expect(render(messages)).toContain('aria-label="リアクションを追加"')
    // 完了済み(reactable なし)では付けられないが、付いているものは見える
    const readonly = render(messages, { reactable: false })
    expect(readonly).not.toContain('aria-label="リアクションを追加"')
    expect(readonly).toContain('👀')
  })

  test('何も押されておらず、押せないときは絵文字の欄自体を出さない', () => {
    const html = render([message()], { reactable: false })
    expect(html).not.toContain('リアクションを追加')
  })

  test('削除済みのメッセージには絵文字を出さない', () => {
    const html = render(
      [
        message({
          deleted: true,
          body: '',
          reactions: [reaction('👍', [{ productMemberId: 'm1', userName: '担当者' }])],
        }),
      ],
      { reactable: false },
    )
    expect(html).toContain('削除されました')
    expect(html).not.toContain('👍')
  })
})
