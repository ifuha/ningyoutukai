import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { Check, Trash2, X } from 'lucide-react'
import { IconButton } from '#/components/icon-button'
import { Modal } from '#/components/modal'
import { eden, edenData } from '#/lib/eden'
import { ApiError } from '#/lib/api'
import type { ProductTree, TreeMember } from '#/lib/tree'

const roleLabel = { leader: 'リーダー', member: 'メンバー' } as const

// メンバー 1 人分の行。リーダーが role=member の行で「外す」を押すと、同じ行で確認を出す。
// 成功したらツリーを取り直し、行は消える。失敗(404/403 など)は行を残し、取り直さない
// (取り直すと行ごと消えてエラーが読めない)。404 は押せないままにする
function MemberRow({
  productId,
  member,
  canRemove,
}: {
  productId: string
  member: TreeMember
  canRemove: boolean
}) {
  const queryClient = useQueryClient()
  const [confirming, setConfirming] = useState(false)
  const remove = useMutation({
    mutationFn: () =>
      edenData(
        eden()
          .api.product({ productId })
          .member({ memberId: member.productMemberId })
          .delete(),
      ),
    onSuccess: () =>
      queryClient.invalidateQueries({
        queryKey: ['products', productId, 'tree'],
      }),
  })
  const gone = remove.error instanceof ApiError && remove.error.status === 404
  const count = member.tasks.length

  return (
    <li className="space-y-2 text-m">
      <div className="flex flex-wrap items-center gap-3">
        {member.avatarUrl ? (
          <img
            src={member.avatarUrl}
            alt=""
            className="size-8 shrink-0 border border-current object-cover"
          />
        ) : (
          <span
            aria-hidden="true"
            className="flex size-8 shrink-0 items-center justify-center border border-current font-bold"
          >
            {[...member.userName][0] ?? '?'}
          </span>
        )}
        <div className="min-w-0 flex-1">
          <p className="font-bold break-words">{member.userName}</p>
          <p className="text-s opacity-60">
            {roleLabel[member.role]} / タスク {count} 件
          </p>
        </div>
        {canRemove && !confirming && (
          <IconButton
            icon={Trash2}
            label="外す"
            variant="outline"
            size="sm"
            side="left"
            disabled={gone}
            onClick={() => setConfirming(true)}
          />
        )}
      </div>
      {canRemove && confirming && (
        <div className="space-y-2 border-l border-line pl-3">
          <p>
            {member.userName} を外しますか?
            {count > 0 && ` 担当の ${count} 件のタスクも消えます`}
          </p>
          <div className="flex gap-3">
            <IconButton
              icon={Check}
              label="外す(確定)"
              variant="outline"
              disabled={remove.isPending || gone}
              onClick={() => remove.mutate()}
            />
            <IconButton
              icon={X}
              label="やめる"
              variant="outline"
              disabled={remove.isPending}
              onClick={() => {
                setConfirming(false)
                remove.reset()
              }}
            />
          </div>
        </div>
      )}
      {remove.isError && (
        <p role="alert" className="border-l border-line pl-3">
          ERR {remove.error.message}
        </p>
      )}
    </li>
  )
}

// メンバー管理。全員が一覧を見られ、リーダーだけメンバーを外せる。
// 一覧はツリー(担当タスクの件数も入っている)から出すので、追加の通信はない
export function MemberManageDialog({
  productId,
  tree,
  isLeader,
  open,
  onClose,
}: {
  productId: string
  tree: ProductTree
  isLeader: boolean
  open: boolean
  onClose: () => void
}) {
  const members = [tree.leader, ...tree.members]
  return (
    <Modal open={open} onClose={onClose}>
      <h2 className="text-l font-bold">メンバー({members.length} 人)</h2>
      <ul className="space-y-4">
        {members.map((m) => (
          <MemberRow
            key={m.productMemberId}
            productId={productId}
            member={m}
            canRemove={isLeader && m.role === 'member'}
          />
        ))}
      </ul>
      <IconButton
        icon={X}
        label="閉じる"
        variant="outline"
        onClick={onClose}
      />
    </Modal>
  )
}
