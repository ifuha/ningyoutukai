import { useQuery } from '@tanstack/react-query'
import { formatDateTime } from '#/components/member-card'
import { eden, edenData } from '#/lib/eden'
import { errorMessage } from '#/lib/error-message'

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

// 1 件分の行。削除済みは本文を出さず、「削除されました」とだけ出す(履歴の並びは崩さない)
function MessageRow({ message }: { message: TaskMessage }) {
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
      ) : (
        message.body && (
          <p className="break-words whitespace-pre-wrap">{message.body}</p>
        )
      )}
    </li>
  )
}

// タスクの詳細の「やりとり」の欄。報告・再提出・差し戻し・承認・コメントを、古い順に出す(読むだけ)。
// タスクを見られる人なら、誰でも読める(api が判定する)
export function TaskMessages({
  productId,
  taskId,
}: {
  productId: string
  taskId: string
}) {
  const messages = useQuery({
    queryKey: ['products', productId, 'task', taskId, 'messages'],
    queryFn: () => listMessages(productId, taskId),
    retry: false,
  })

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
        <ul className="max-h-64 space-y-3 overflow-y-auto">
          {messages.data.messages.map((message) => (
            <MessageRow key={message.messageId} message={message} />
          ))}
        </ul>
      )}
    </section>
  )
}