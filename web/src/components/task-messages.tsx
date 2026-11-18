import { useEffect, useRef, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { formatDateTime } from '#/components/member-card'
import { TaskMessageForm } from '#/components/task-message-form'
import { eden, edenData } from '#/lib/eden'
import { errorMessage } from '#/lib/error-message'
import {
  canSubmitMessage,
  MAX_MESSAGE_LENGTH,
  normalizeMessageBody,
} from '#/lib/message-body'

/** `GET /api/product/:productId/task/:taskId/message` の応答(api の型から取る) */
type MessageList = Awaited<ReturnType<typeof listMessages>>
const listMessages = (productId: string, taskId: string) =>
  edenData(eden().api.product({ productId }).task({ taskId }).message.get())

// 1 件分のメッセージ。型は api の応答から取る
type TaskMessage = MessageList['messages'][number]

// 行の見出しに出す、メッセージの種類。コメントは印を付けない
const kindLabel: Record<TaskMessage['kind'], string | null> = {
  comment: null,
  report: '完了報告',
  resubmit: '再提出',
  reject: '差し戻し',
  approve: '承認',
}

const textareaClass =
  'min-h-16 w-full resize-y border border-line bg-panel p-2 text-m text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink disabled:opacity-60'

const actionClass =
  'cursor-pointer text-s underline-offset-2 hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink disabled:opacity-60 disabled:hover:no-underline'

// 1 件分の行。削除済みは本文を出さず、「削除されました」とだけ出す(履歴の並びは崩さない)。
// 本人なら編集・削除ができる(api が canEdit / canDelete で判定して返す。削除できるのはコメントだけ)
function MessageRow({
  productId,
  taskId,
  message,
}: {
  productId: string
  taskId: string
  message: TaskMessage
}) {
  const queryClient = useQueryClient()
  const [editing, setEditing] = useState(false)
  const [text, setText] = useState(message.body)
  const [confirming, setConfirming] = useState(false)
  const queryKey = ['products', productId, 'task', taskId, 'messages']

  // 編集・削除は件数が変わらないので、一覧の末尾は動かさない(取得し直して表示だけ入れ替える)
  const save = useMutation({
    mutationFn: (body: string) =>
      edenData(
        eden()
          .api.product({ productId })
          .task({ taskId })
          .message({ messageId: message.messageId })
          .patch({ body }),
      ),
    onSuccess: () => {
      setEditing(false)
      void queryClient.invalidateQueries({ queryKey })
    },
  })
  const remove = useMutation({
    mutationFn: () =>
      edenData(
        eden()
          .api.product({ productId })
          .task({ taskId })
          .message({ messageId: message.messageId })
          .delete(),
      ),
    onSuccess: () => {
      setConfirming(false)
      void queryClient.invalidateQueries({ queryKey })
    },
  })
  const busy = save.isPending || remove.isPending
  const label = kindLabel[message.kind]

  return (
    <li className="space-y-0.5 text-m">
      <p className="text-s opacity-60">
        {message.author.userName}
        {label && ` / ${label}`}
        {` / ${formatDateTime(message.createdAt)}`}
        {message.editedAt && ' / 編集済み'}
      </p>
      {message.deleted ? (
        <p className="opacity-60">削除されました</p>
      ) : editing ? (
        <div className="space-y-1">
          <textarea
            aria-label="メッセージを編集"
            value={text}
            maxLength={MAX_MESSAGE_LENGTH}
            disabled={busy}
            autoFocus
            onChange={(e) => {
              setText(e.target.value)
              save.reset()
            }}
            className={textareaClass}
          />
          <div className="flex items-center justify-between gap-3">
            <span className="text-s opacity-60">
              {text.length} / {MAX_MESSAGE_LENGTH}
            </span>
            <span className="flex gap-3">
              <button
                type="button"
                className={actionClass}
                disabled={busy}
                onClick={() => {
                  setEditing(false)
                  setText(message.body)
                  save.reset()
                }}
              >
                やめる
              </button>
              <button
                type="button"
                className={actionClass}
                disabled={busy || !canSubmitMessage(text)}
                onClick={() => save.mutate(normalizeMessageBody(text))}
              >
                保存
              </button>
            </span>
          </div>
          {save.isError && (
            <p role="alert" className="border-l border-line pl-3 text-m">
              ERR {errorMessage(save.error.message)}
            </p>
          )}
        </div>
      ) : (
        <>
          {message.body && (
            <p className="break-words whitespace-pre-wrap">{message.body}</p>
          )}
          {(message.canEdit || message.canDelete) && (
            <div className="flex flex-wrap items-center gap-3 text-s">
              {message.canEdit && !confirming && (
                <button
                  type="button"
                  className={actionClass}
                  disabled={busy}
                  onClick={() => {
                    setText(message.body)
                    save.reset()
                    setEditing(true)
                  }}
                >
                  編集
                </button>
              )}
              {message.canDelete &&
                (confirming ? (
                  <>
                    <span className="opacity-70">
                      このメッセージを削除しますか?
                    </span>
                    <button
                      type="button"
                      className={actionClass}
                      disabled={busy}
                      onClick={() => remove.mutate()}
                    >
                      削除する
                    </button>
                    <button
                      type="button"
                      className={actionClass}
                      disabled={busy}
                      onClick={() => setConfirming(false)}
                    >
                      やめる
                    </button>
                  </>
                ) : (
                  <button
                    type="button"
                    className={actionClass}
                    disabled={busy}
                    onClick={() => setConfirming(true)}
                  >
                    削除
                  </button>
                ))}
            </div>
          )}
          {remove.isError && (
            <p role="alert" className="border-l border-line pl-3 text-m">
              ERR {errorMessage(remove.error.message)}
            </p>
          )}
        </>
      )}
    </li>
  )
}

// タスクの詳細の「やりとり」の欄。報告・再提出・差し戻し・承認・コメントを、古い順に出す。
// タスクを見られる人なら、誰でも読める(api が判定する)。
// `canComment`(リーダーと担当者)のときだけ、コメントの入力欄を出す
export function TaskMessages({
  productId,
  taskId,
  canComment = false,
}: {
  productId: string
  taskId: string
  canComment?: boolean
}) {
  const messages = useQuery({
    queryKey: ['products', productId, 'task', taskId, 'messages'],
    queryFn: () => listMessages(productId, taskId),
    retry: false,
  })

  // 件数が変わったとき(初めて読み込んだとき、コメントを投稿したとき)に、いちばん新しいメッセージが見えるよう、
  // 一覧の末尾までスクロールする。編集・削除は件数が変わらないので、動かさない
  const listRef = useRef<HTMLUListElement>(null)
  const count = messages.data?.messages.length
  useEffect(() => {
    const el = listRef.current
    if (el) el.scrollTop = el.scrollHeight
  }, [count])

  return (
    <section aria-label="やりとり" className="space-y-2">
      <h3 className="text-s opacity-60">やりとり</h3>
      {messages.isPending ? (
        <p className="text-m opacity-60">読み込み中…</p>
      ) : messages.isError ? (
        <p role="alert" className="border-l border-line pl-3 text-m">
          ERR {errorMessage(messages.error.message)}
        </p>
      ) : messages.data.messages.length === 0 ? (
        <p className="text-m">やりとりはまだありません</p>
      ) : (
        <ul ref={listRef} className="max-h-64 space-y-3 overflow-y-auto">
          {messages.data.messages.map((message) => (
            <MessageRow
              key={message.messageId}
              productId={productId}
              taskId={taskId}
              message={message}
            />
          ))}
        </ul>
      )}
      {canComment && <TaskMessageForm productId={productId} taskId={taskId} />}
    </section>
  )
}
