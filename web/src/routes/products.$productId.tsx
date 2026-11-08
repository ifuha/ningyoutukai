import { useEffect, useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { createFileRoute, useNavigate } from '@tanstack/react-router'
import { ArrowLeft, ClipboardCheck } from 'lucide-react'
import { IconButton } from '#/components/icon-button'
import { AppShell } from '#/components/app-shell'
import { Loading } from '#/components/loading'
import { DocumentsFeature } from '#/components/documents-feature'
import { InviteMemberDialog } from '#/components/invite-member-dialog'
import { ManageMenu, type ManageMenuItem } from '#/components/manage-menu'
import { MemberManageDialog } from '#/components/member-manage-dialog'
import { ProductSettingsDialog } from '#/components/product-settings-dialog'
import { TaskKindDialog } from '#/components/task-kind-dialog'
import { ProductTree } from '#/components/product-tree'
import { pendingReviews, ReviewDialog } from '#/components/review-dialog'
import {
  TaskDetailDialog,
  type TaskDetailTarget,
} from '#/components/task-detail-dialog'
import { TaskListDialog } from '#/components/task-list-dialog'
import { useProductRevision } from '#/lib/use-product-revision'
import { retryDelay, retryTransient } from '#/lib/query-retry'
import {
  TaskFormDialog,
  type TaskFormTarget,
} from '#/components/task-form-dialog'
import { ApiError } from '#/lib/api'
import type { ProductTree as TreeData, TreeMember, TreeTask } from '#/lib/tree'
import { fetchUnlessCommitted } from '#/lib/pending-commits'
import { eden, edenData } from '#/lib/eden'
import { canEditSections } from '#/lib/section-permissions'
import { useSectionActions } from '#/lib/use-section-actions'
import { treeQueryKey, useSections } from '#/lib/use-sections'
import { parseProductSearch } from '#/lib/product-search'
import { useProductCommentActions, useProductComments } from '#/lib/use-product-comments'
import { useProductNoteActions, useProductNotes } from '#/lib/use-product-notes'

// プロダクトの画面(`/products/$productId`)。ログイン必須。見出しと、ツリー(リーダーとメンバー、タスク)
// 見た目は暫定(ターミナル風)。Figma の `tree` の設計ができたら入れ替える
// 検索パラメータ `?settings=product`: 開いたら「プロダクト設定」のモーダルを開く(サイドバーの行のメニューから)
export const Route = createFileRoute('/products/$productId')({
  validateSearch: parseProductSearch,
  component: Product,
})

const roleLabel = { leader: 'リーダー', member: 'メンバー' } as const

function Product() {
  const { productId } = Route.useParams()
  const { settings } = Route.useSearch()
  const navigate = useNavigate()
  const [taskForm, setTaskForm] = useState<TaskFormTarget | null>(null)
  // 自分のタスクの詳細(完了報告)を開いているタスク。再取得で最新になるよう、id で持つ
  const [detailId, setDetailId] = useState<string | null>(null)
  // 全タスクの一覧を開いている人(再取得で最新になるよう、id で持つ)
  const [listMemberId, setListMemberId] = useState<string | null>(null)
  const [reviewOpen, setReviewOpen] = useState(false)
  const [membersOpen, setMembersOpen] = useState(false)
  const [kindsOpen, setKindsOpen] = useState(false)
  const [inviteOpen, setInviteOpen] = useState(false)
  const [productSettingsOpen, setProductSettingsOpen] = useState(false)
  // 文書(右側のツリー)を開いているか。「管理」メニューの「文書」で開閉する
  const [docsOpen, setDocsOpen] = useState(false)
  // 他の人の変更を、数秒ごとに見に行って、変わったときだけ取り直す(ドラッグの最中は待つ)
  useProductRevision(productId)
  const queryClient = useQueryClient()
  const product = useQuery({
    queryKey: ['products', productId],
    queryFn: () => edenData(eden().api.product({ productId }).get()),
    retry: retryTransient,
    retryDelay,
  })
  const tree = useQuery({
    queryKey: ['products', productId, 'tree'],
    // 確定と重なった取得の応答(確定の前の状態)は捨てて、画面の値を保つ(`pending-commits.ts`)
    queryFn: () =>
      fetchUnlessCommitted(
        async () => {
          const t = await edenData(eden().api.product({ productId }).tree.get())
          // api の型では `leader` は null になりうる(手書きの型は null を考えていなかった)。
          // 画面はリーダーがいる前提なので、いない場合は、描画で落ちる前にエラーにする
          if (!t.leader) throw new ApiError(500, 'エラーが発生しました')
          return { ...t, leader: t.leader }
        },
        () => queryClient.getQueryData<TreeData>(treeQueryKey(productId)),
      ),
    retry: retryTransient,
    retryDelay,
  })

  // セクションの四角(F1)。補助の表示なので、取得に失敗しても、ツリーは出す(セクションだけ出ない)
  const sections = useSections(productId)
  const notes = useProductNotes(productId)
  const noteActions = useProductNoteActions(productId)
  const comments = useProductComments(productId)
  const commentActions = useProductCommentActions(productId)
  // セクションの操作(作成・更新・削除・カードの移動)。画面の値を先に更新し、失敗したら元に戻して、通知する
  const sectionActions = useSectionActions(productId)

  const isLeader = product.data?.role === 'leader'

  // `?settings=product` で開いたら、リーダーならダイアログを開き、パラメータを消す(履歴は置き換えるので、戻るボタンで再び開かない)。
  // プロダクトの情報が届くまでは待つ(リーダーかどうかが分からない)。取得に失敗したときは、開かずに消す
  useEffect(() => {
    if (settings !== 'product') return
    if (product.data === undefined && !product.isError) return
    if (isLeader) setProductSettingsOpen(true)
    void navigate({ to: '/products/$productId', params: { productId }, search: {}, replace: true })
  }, [settings, product.data, product.isError, isLeader, navigate, productId])
  // 「管理」メニューの項目。足すときは 1 行足す(リーダーだけなら isLeader の側に)
  const manageItems: ManageMenuItem[] = [
    { label: 'メンバー', onSelect: () => setMembersOpen(true) },
    { label: docsOpen ? '文書を閉じる' : '文書', onSelect: () => setDocsOpen((open) => !open) },
    ...(isLeader
      ? [
          { label: 'タスクの種類', onSelect: () => setKindsOpen(true) },
          { label: 'メンバーを招待', onSelect: () => setInviteOpen(true) },
          { label: 'プロダクト設定', onSelect: () => setProductSettingsOpen(true) },
        ]
      : []),
  ]
  const myId = tree.data?.viewerProductMemberId
  // 自分のタスクは詳細(リーダーも。編集は詳細から)、他人のタスクはリーダーだけ編集
  const canOpenTask = (m: TreeMember) => isLeader || m.productMemberId === myId
  const openTask = (_member: TreeMember, task: TreeTask) => {
    setListMemberId(null)
    setDetailId(task.taskId)
  }
  const detail: TaskDetailTarget | null = tree.data
    ? [tree.data.leader, ...tree.data.members].reduce<TaskDetailTarget | null>(
        (found, member) => {
          const task = member.tasks.find((t) => t.taskId === detailId)
          return found ?? (task ? { task, member } : null)
        },
        null,
      )
    : null

  // 見出しと右のボタン群。キャンバスの上に重ねる(ボタンのところだけ操作できる)
  const header = (
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
            <h1 className="text-l font-bold break-words">
              {product.data.productName}
            </h1>
            <p className="text-m opacity-70">
              {roleLabel[product.data.role]}
            </p>
          </>
        )}
      </div>
      <div className="pointer-events-auto flex flex-wrap items-center">
        {tree.data && <ManageMenu items={manageItems} />}
        {product.data?.role === 'leader' && (
          <>
            {tree.data && (
              <IconButton
                icon={ClipboardCheck}
                label={`確認待ち ${pendingReviews(tree.data).length} 件`}
                showLabel
                variant="outline"
                className="bg-panel"
                side="bottom"
                onClick={() => setReviewOpen(true)}
              />
            )}
          </>
        )}
      <IconButton
        icon={ArrowLeft}
        label="ホームへ戻る"
        variant="outline"
        className="bg-panel"
        side="bottom"
        onClick={() => void navigate({ to: '/home' })}
      />
      </div>
    </div>
  )

  return (
    <AppShell activeProductId={productId} align="full">
      {() => (
        <div className="relative h-full min-w-0">
          {/* 今あるデータは、取り直しに失敗しても出しつづける(一時的な失敗で、ツリーが消えて ERR に置き換わらない) */}
          {product.data === undefined || tree.data === undefined ? (
            <div className="space-y-6 p-4">
              {header}
              {product.isError && product.data === undefined ? null : tree.isError && tree.data === undefined ? (
                <p role="alert" className="border-l border-line pl-3 text-m">
                  ERR {tree.error.message}
                </p>
              ) : (
                <Loading />
              )}
            </div>
          ) : (
            <>
              <ProductTree
                key={productId}
                header={header}
                tree={tree.data}
                sections={sections.data}
                notes={notes.data}
                onAddMemo={async (position) => { await noteActions.add(position.x, position.y) }}
                onUpdateMemo={async (id, patch) => { await noteActions.update(id, patch) }}
                onDeleteMemo={async (id) => { await noteActions.remove(id) }}
                comments={comments.data}
                onAddComment={isLeader ? async (comment) => { await commentActions.add(comment) } : undefined}
                onUpdateComment={async (id, patch) => { await commentActions.update(id, patch) }}
                onDeleteComment={async (id) => { await commentActions.remove(id) }}
                canEditSections={canEditSections(product.data?.role)}
                sectionActions={sectionActions}
                onEditTask={openTask}
                canOpenTask={canOpenTask}
                onShowTasks={(member) => setListMemberId(member.productMemberId)}
                onOpenAi={(ai) => {
                  // 確認待ちの下書きがあるタスクの詳細を開く(そこで、下書きを確認する)
                  const taskId = ai.pendingTaskIds?.[0]
                  if (taskId) setDetailId(taskId)
                }}
                onAddTask={isLeader ? (member) => setTaskForm({ memberId: member.productMemberId }) : undefined}
                onOpenMembers={isLeader ? () => setMembersOpen(true) : undefined}
              />
            <DocumentsFeature
              productId={productId}
              open={docsOpen}
              isLeader={isLeader}
              myMemberId={myId}
              onClose={() => setDocsOpen(false)}
            />
            <TaskListDialog
              member={
                [tree.data.leader, ...tree.data.members].find(
                  (m) => m.productMemberId === listMemberId,
                ) ?? null
              }
              onClose={() => setListMemberId(null)}
              onEditTask={openTask}
              canOpenTask={canOpenTask}
            />
            <TaskDetailDialog
              productId={productId}
              target={detail}
              canReport={detail?.member.productMemberId === myId}
              canComment={isLeader || detail?.member.productMemberId === myId} 
              onEdit={
                isLeader
                  ? ({ task, member }) => {
                      setDetailId(null)
                      setTaskForm({ edit: { task, member } })
                    }
                  : undefined
              }
              onClose={() => setDetailId(null)}
            />
            <MemberManageDialog
              productId={productId}
              tree={tree.data}
              isLeader={isLeader}
              open={membersOpen}
              onClose={() => setMembersOpen(false)}
            />
            {isLeader && (
              <>
                <TaskKindDialog
                  productId={productId}
                  open={kindsOpen}
                  onClose={() => setKindsOpen(false)}
                />
                <InviteMemberDialog
                  productId={productId}
                  open={inviteOpen}
                  onClose={() => setInviteOpen(false)}
                />
                <ProductSettingsDialog
                  productId={productId}
                  productName={
                    product.data?.productName ?? tree.data.product.productName
                  }
                  memberCount={tree.data.members.length + 1}
                  avatarUrl={product.data?.avatarUrl ?? tree.data.product.avatarUrl}
                  documentAutoDeleteDays={product.data?.documentAutoDeleteDays}
                  open={productSettingsOpen}
                  onClose={() => setProductSettingsOpen(false)}
                />
              </>
            )}
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
            </>
          )}
        </div>
      )}
    </AppShell>
  )
}
