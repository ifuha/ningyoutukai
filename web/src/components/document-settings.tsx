import { Save } from 'lucide-react'
import { useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { IconButton } from '#/components/icon-button'
import { updateDocumentSetting } from '#/lib/document-api'
import { AUTO_DELETE_DEFAULT_DAYS, autoDeleteDaysError, describeDays, parseAutoDeleteDays } from '#/lib/document-setting'
import { errorMessage } from '#/lib/error-message'

// プロダクト設定の「文書」: 長い間呼び出されない文書を、何日で自動削除するか(リーダーだけ)。仕様は docs/v4.0/overview.md
// - 最後に呼び出されてから(AI が CLI で取った / 人が画面で開いた)N 日。初期は 7 日
// - 消すのは毎日 1 回(日本時間の 3:00)。消したら、参加者全員にメールで知らせる。ごみ箱はない(戻せない)
// - 消さない文書: 文書ごとの「自動削除しない」/ 未完了のタスクに渡している文書 / 編集中の文書
export function DocumentSettings({ productId, days }: { productId: string; days?: number }) {
  const queryClient = useQueryClient()
  const current = days ?? AUTO_DELETE_DEFAULT_DAYS
  const [value, setValue] = useState(String(current))
  const save = useMutation({
    mutationFn: (n: number) => updateDocumentSetting(productId, n),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['products'] })
      void queryClient.invalidateQueries({ queryKey: ['products', productId] })
    },
  })
  const problem = value === String(current) ? null : autoDeleteDaysError(value)
  const parsed = parseAutoDeleteDays(value)
  const unchanged = parsed === current

  return (
    <form
      className="space-y-3"
      onSubmit={(e) => {
        e.preventDefault()
        if (parsed !== null) save.mutate(parsed)
      }}
    >
      <label htmlFor="document-auto-delete-days" className="block text-m font-bold">
        文書の自動削除(最後に呼び出されてから)
      </label>
      <div className="flex flex-wrap items-center gap-2">
        <input
          id="document-auto-delete-days"
          type="text"
          inputMode="numeric"
          value={value}
          maxLength={4}
          disabled={save.isPending}
          aria-describedby="document-auto-delete-help"
          aria-invalid={problem !== null}
          onChange={(e) => {
            setValue(e.target.value)
            save.reset()
          }}
          className="h-10 w-28 shadow-box bg-panel px-2 text-right text-m text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink disabled:opacity-60"
        />
        <span className="text-m">日</span>
        <IconButton type="submit" icon={Save} label="保存" showLabel variant="outline" className="bg-panel" disabled={save.isPending || parsed === null || unchanged} />
      </div>
      {problem && (
        <p role="alert" className="border-l border-line pl-3 text-m">
          {problem}
        </p>
      )}
      {save.isError && (
        <p role="alert" className="border-l border-line pl-3 text-m">
          ERR {errorMessage(save.error.message)}
        </p>
      )}
      {save.isSuccess && <p className="text-m">変更しました(いまは {describeDays(current)})</p>}
      <div id="document-auto-delete-help" className="space-y-1 text-s opacity-80">
        <p>
          いまの設定: <strong className="font-bold">{describeDays(current)}</strong> 呼び出されない文書を、自動で削除します(1〜3650 日)。AI が取る・人が画面で開く、のどちらも「呼び出し」です。毎日 1 回(日本時間の 3:00)に動きます。
        </p>
        <p>削除すると、プロダクトの参加者全員にメールで知らせます。ごみ箱はないので、戻せません。</p>
        <p>消えない文書: 文書ごとに「自動削除しない」を付けたもの / 未完了のタスクに渡している文書 / 編集中の文書。</p>
      </div>
    </form>
  )
}
