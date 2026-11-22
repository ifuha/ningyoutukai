import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { createFileRoute, useNavigate } from '@tanstack/react-router'
import { ArrowLeft } from 'lucide-react'
import { AppShell } from '#/components/app-shell'
import { IconButton } from '#/components/icon-button'
import { Loading } from '#/components/loading'
import { formatDateTime } from '#/components/member-card'
import { TaskMessages } from '#/components/task-messages'
import { completedHistory } from '#/lib/completed-history'
import { eden, edenData } from '#/lib/eden'
import { retryDelay, retryTransient } from '#/lib/query-retry'

// 完了した報告の履歴(`/products/$productId/history`)。ログイン必須。
// 完了にしたタスクはツリーから消えるので、ここで、完了日時の新しい順に一覧し、行を開くと、そのやりとり(報告・差し戻し・承認)を読める。
// 読むだけ(入力欄・リアクションは出さない。完了済みのタスクは api も編集を受け付けない)。
// 見えるタスクは api が決める(リーダーは全部、メンバーは公開のものと自分のもの)。
// プロダクトの画面(`products.$productId.tsx`)の子にはしない(あちらは `Outlet` を置かず、ツリーを出しつづけるため)
export const Route = createFileRoute('/products/$productId_/history')({
  component: History,
})

const roleLabel = { leader: 'リーダー', member: 'メンバー' } as const

function History() {
  const { productId } = Route.useParams()
  const navigate = useNavigate()
  // 開いている(やりとりを出している)タスク
  const [openId, setOpenId] = useState<string | null>(null)
  const product = useQuery({
    queryKey: ['products', productId],
    queryFn: () => edenData(eden().api.product({ productId }).get()),
    retry: retryTransient,
    retryDelay,
  })
  const tasks = useQuery({
    queryKey: ['products', productId, 'tasks', 'completed'],
    queryFn: () =>
      edenData(eden().api.product({ productId }).task.get({ query: { includeCompleted: true } })),
    retry: retryTransient,
    retryDelay,
  })
  // 担当者の名前を出すため。取れなくても、一覧は出す(名前だけ出ない)
  const members = useQuery({
    queryKey: ['products', productId, 'members'],
    queryFn: () => edenData(eden().api.product({ productId }).member.get()),
    retry: retryTransient,
    retryDelay,
  })
  const entries = tasks.data ? completedHistory(tasks.data, members.data) : []

  return (
    <AppShell activeProductId={productId} align="top">
      {() => (
        <section aria-label="完了した報告" className="w-full max-w-2xl space-y-6 px-4">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div className="flex min-w-48 flex-1 flex-wrap items-baseline gap-x-3">
              {product.isError && product.data === undefined ? (
                <p role="alert" className="border-l border-line pl-3 text-m">
                  ERR {product.error.message}
                </p>
              ) : product.data === undefined ? (
                <Loading />
              ) : (
                <>
                  <p className="text-l font-black break-words">{product.data.productName}</p>
                  <p className="text-m opacity-70">{roleLabel[product.data.role]}</p>
                </>
              )}
            </div>
            <IconButton
              icon={ArrowLeft}
              label="プロダクトへ戻る"
              variant="outline"
              className="bg-panel"
              side="bottom"
              onClick={() => void navigate({ to: '/products/$productId', params: { productId } })}
            />
          </div>
          <h1 className="text-l font-black">完了した報告の履歴</h1>
          {tasks.isPending ? (
            <Loading />
          ) : tasks.isError ? (
            <p role="alert" className="border-l border-line pl-3 text-m">
              ERR {tasks.error.message}
            </p>
          ) : entries.length === 0 ? (
            <p className="text-m">完了した報告はまだありません</p>
          ) : (
            <ul className="border-t border-line bg-panel">
              {entries.map(({ task, assigneeName }) => {
                const open = openId === task.taskId
                return (
                  <li key={task.taskId} className="border-b border-line">
                    <button
                      type="button"
                      aria-expanded={open}
                      onClick={() => setOpenId(open ? null : task.taskId)}
                      className="w-full cursor-pointer px-3 py-2 text-left text-m hover:bg-side-item focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ink"
                    >
                      <span className="block break-words">{task.taskName}</span>
                      <span className="block text-s opacity-60">
                        {[
                          assigneeName,
                          task.reportedAt && `報告 ${formatDateTime(task.reportedAt)}`,
                          task.completedAt && `完了 ${formatDateTime(task.completedAt)}`,
                        ]
                          .filter(Boolean)
                          .join(' / ')}
                      </span>
                    </button>
                    {open && (
                      <div className="px-3 pt-3 pb-3">
                        <TaskMessages productId={productId} taskId={task.taskId} />
                      </div>
                    )}
                  </li>
                )
              })}
            </ul>
          )}
        </section>
      )}
    </AppShell>
  )
}
