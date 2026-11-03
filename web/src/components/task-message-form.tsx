import { useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { Send } from 'lucide-react'
import { IconButton } from '#/components/icon-button'
import { eden, edenData } from '#/lib/eden'
import { errorMessage } from '#/lib/error-message'
import {
  canSubmitMessage,
  MAX_MESSAGE_LENGTH,
  normalizeMessageBody,
} from '#/lib/message-body'

const textareaClass =
  'min-h-20 w-full resize-y border border-line bg-surface p-2 text-m text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink disabled:opacity-60'

// コメントの入力欄。リーダーと担当者にだけ出す(api が、それ以外は 403、完了済みは 409 にする)。
// 送れたら入力欄を空にして、履歴を取り直す。失敗したら、入力は残して、理由を出す
export function TaskMessageForm({
  productId,
  taskId,
}: {
  productId: string
  taskId: string
}) {
  const queryClient = useQueryClient()
  const [text, setText] = useState('')
  const post = useMutation({
    mutationFn: (body: string) =>
      edenData(
        eden()
          .api.product({ productId })
          .task({ taskId })
          .message.post({ body }),
      ),
    onSuccess: () => {
      setText('')
      void queryClient.invalidateQueries({
        queryKey: ['products', productId, 'task', taskId, 'messages'],
      })
    },
  })
  const submittable = canSubmitMessage(text)
  const submit = () => {
    if (post.isPending || !submittable) return
    post.mutate(normalizeMessageBody(text))
  }

  return (
    <form
      className="space-y-2"
      onSubmit={(e) => {
        e.preventDefault()
        submit()
      }}
    >
      <textarea
        aria-label="コメント"
        placeholder="コメントを書く(Ctrl + Enter で送信)"
        value={text}
        maxLength={MAX_MESSAGE_LENGTH}
        disabled={post.isPending}
        onChange={(e) => {
          setText(e.target.value)
          post.reset()
        }}
        onKeyDown={(e) => {
          if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
            e.preventDefault()
            submit()
          }
        }}
        className={textareaClass}
      />
      <div className="flex items-center justify-between gap-3">
        <span className="text-s opacity-60">
          {text.length} / {MAX_MESSAGE_LENGTH}
        </span>
        <IconButton
          type="submit"
          icon={Send}
          label="送信"
          showLabel
          variant="outline"
          disabled={post.isPending || !submittable}
        />
      </div>
      {post.isError && (
        <p role="alert" className="border-l border-line pl-3 text-m">
          ERR {errorMessage(post.error.message)}
        </p>
      )}
    </form>
  )
}