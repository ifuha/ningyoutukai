import { useState, type ReactNode } from 'react'
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

// 右側は、中に置く送信ボタンのぶん空ける(文字がボタンの下に潜らないように)
const textareaClass =
  'block min-h-28 w-full resize-y rounded-sm border border-line bg-panel p-3 pr-12 text-m text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink disabled:opacity-60'

// コメントの入力欄。リーダーと担当者にだけ出す(api が、それ以外は 403、完了済みは 409 にする)。
// 送れたら入力欄を空にして、履歴を取り直す。失敗したら、入力は残して、理由を出す
export function TaskMessageForm({
  productId,
  taskId,
  beforeSend,
}: {
  productId: string
  taskId: string
  /** 「送信」の左に置くボタン(例: 完了を報告・差し戻す)。いま入っている本文と、
   *  送り終わった本文を入力欄から消す関数を渡す(**成功したときだけ**呼ぶ)。
   *  ボタンは本文をそのまま送れるように作る(フォームの中に出すので `type="button"` にする) */
  beforeSend?: (text: string, clear: () => void) => ReactNode
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
      <div className="relative">
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
        {/* 送信ボタンは入力欄の右下(内側)に置く。リサイズのつまみは避ける。
            span は flex にして、行の高さ(ベースラインの余白)でボタンがずれないようにする。
            紙飛行機のアイコンは右上に重心があるので、見た目の中央に寄せる(左下へ 1px)。
            ホバーは、塗りを薄くするのではなく、背景を淡い色に変える */}
        <span className="absolute right-3 bottom-3 flex">
          <IconButton
            type="submit"
            icon={Send}
            label="送信"
            size="sm"
            variant="solid"
            className="rounded-full hover:border-line hover:bg-side-item hover:text-ink hover:opacity-100 [&>svg]:-translate-x-px [&>svg]:translate-y-px"
            disabled={post.isPending || !submittable}
          />
        </span>
      </div>
      <div className="flex items-center justify-between gap-3">
        <span className="text-s opacity-60">
          {text.length} / {MAX_MESSAGE_LENGTH}
        </span>
        <span className="flex items-center gap-3">
          {beforeSend?.(text, () => setText(''))}
        </span>
      </div>
      {post.isError && (
        <p role="alert" className="border-l border-line pl-3 text-m">
          ERR {errorMessage(post.error.message)}
        </p>
      )}
    </form>
  )
}