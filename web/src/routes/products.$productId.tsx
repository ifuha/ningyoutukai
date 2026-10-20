import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { createFileRoute, useNavigate } from '@tanstack/react-router'
import { AppShell } from '#/components/app-shell'
import { InviteMemberDialog } from '#/components/invite-member-dialog'
import { ProductTree } from '#/components/product-tree'
import { pendingReviews, ReviewDialog } from '#/components/review-dialog'
import { TaskListDialog } from '#/components/task-list-dialog'
import {
  TaskFormDialog,
  type TaskFormTarget,
} from '#/components/task-form-dialog'
import {
  api,
  type ProductSummary,
  type ProductTree as ProductTreeData,
} from '#/lib/api'

// プロダクトの画面(`/products/$productId`)。ログイン必須。見出しと、ツリー(リーダーとメンバー、タスク)
// 見た目は暫定(ターミナル風)。Figma の `tree` の設計ができたら入れ替える
export const Route = createFileRoute('/products/$productId')({
  component: Product,
})

const roleLabel = { leader: 'リーダー', member: 'メンバー' } as const

function Product() {
  const { productId } = Route.useParams()
  const navigate = useNavigate()
  const [taskForm, setTaskForm] = useState<TaskFormTarget | null>(null)
  // 全タスクの一覧を開いている人(再取得で最新になるよう、id で持つ)
  const [listMemberId, setListMemberId] = useState<string | null>(null)
  const [reviewOpen, setReviewOpen] = useState(false)
  const product = useQuery({
    queryKey: ['products', productId],
    queryFn: () => api<ProductSummary>(`/api/product/${productId}`),
    retry: false,
  })
  const tree = useQuery({
    queryKey: ['products', productId, 'tree'],
    queryFn: () => api<ProductTreeData>(`/api/product/${productId}/tree`),
    retry: false,
  })

  return (
    <AppShell activeProductId={productId} align="top">
      {() => (
        <div className="w-full min-w-0 space-y-6">
          <div className="flex items-start justify-between gap-4">
            <div className="min-w-0">
              {product.isPending ? (
                <p className="text-sm opacity-60">読み込み中…</p>
              ) : product.isError ? (
                <p role="alert" className="border-l-2 border-ink pl-3 text-sm">
                  ERR {product.error.message}
                </p>
              ) : (
                <>
                  <h1 className="text-2xl font-bold break-words">
                    {product.data.productName}
                  </h1>
                  <p className="mt-1 text-sm opacity-70">
                    {roleLabel[product.data.role]}
                  </p>
                </>
              )}
            </div>
            <div className="flex shrink-0 items-center gap-3">
              {product.data?.role === 'leader' && (
                <>
                  <button
                    type="button"
                    onClick={() => setTaskForm({})}
                    className="flex h-9 shrink-0 items-center justify-center border-2 border-outline bg-secondary px-3 text-sm text-outline transition-transform duration-100 hover:-translate-x-0.5 hover:-translate-y-0.5 hover:shadow-[3px_3px_0_0_var(--color-ink)] focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-ink active:translate-x-0 active:translate-y-0 active:shadow-none"
                  >
                    タスクを追加
                  </button>
                  {tree.data && (
                    <button
                      type="button"
                      onClick={() => setReviewOpen(true)}
                      className="flex h-9 shrink-0 items-center justify-center border-2 border-outline bg-secondary px-3 text-sm text-outline transition-transform duration-100 hover:-translate-x-0.5 hover:-translate-y-0.5 hover:shadow-[3px_3px_0_0_var(--color-ink)] focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-ink active:translate-x-0 active:translate-y-0 active:shadow-none"
                    >
                      確認待ち {pendingReviews(tree.data).length} 件
                    </button>
                  )}
                  <InviteMemberDialog productId={productId} />
                </>
              )}
            <button
              type="button"
              onClick={() => void navigate({ to: '/home' })}
              className="flex h-9 shrink-0 items-center justify-center border-2 border-outline bg-secondary px-3 text-sm text-outline transition-transform duration-100 hover:-translate-x-0.5 hover:-translate-y-0.5 hover:shadow-[3px_3px_0_0_var(--color-ink)] focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-ink active:translate-x-0 active:translate-y-0 active:shadow-none"
            >
              ホームへ戻る
            </button>
            </div>
          </div>
          {product.isError ? null : tree.isPending || product.isPending ? (
            <p className="text-sm opacity-60">読み込み中…</p>
          ) : tree.isError ? (
            <p role="alert" className="border-l-2 border-ink pl-3 text-sm">
              ERR {tree.error.message}
            </p>
          ) : (
            <div className="pb-4">
              <ProductTree
                tree={tree.data}
                onEditTask={
                  product.data?.role === 'leader'
                    ? (member, task) => setTaskForm({ edit: { task, member } })
                    : undefined
                }
                onShowTasks={(member) => setListMemberId(member.productMemberId)}
              />
              <TaskListDialog
                member={
                  [tree.data.leader, ...tree.data.members].find(
                    (m) => m.productMemberId === listMemberId,
                  ) ?? null
                }
                onClose={() => setListMemberId(null)}
                onEditTask={
                  product.data?.role === 'leader'
                    ? (member, task) => {
                        setListMemberId(null)
                        setTaskForm({ edit: { task, member } })
                      }
                    : undefined
                }
              />
              {product.data?.role === 'leader' && (
                <ReviewDialog
                  productId={productId}
                  items={pendingReviews(tree.data)}
                  open={reviewOpen}
                  onClose={() => setReviewOpen(false)}
                />
              )}
              {product.data?.role === 'leader' && (
                <TaskFormDialog
                  productId={productId}
                  members={[tree.data.leader, ...tree.data.members]}
                  target={taskForm}
                  onClose={() => setTaskForm(null)}
                />
              )}
            </div>
          )}
        </div>
      )}
    </AppShell>
  )
}
