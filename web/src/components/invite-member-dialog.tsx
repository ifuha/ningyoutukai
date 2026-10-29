import { X } from 'lucide-react'
import { IconButton } from '#/components/icon-button'
import { InviteMemberForm } from '#/components/invite-member-form'
import { Modal } from '#/components/modal'

// 「メンバーを招待」のモーダル(リーダーにだけ出す。開閉は親が持つ)。
// フォームは開いている間だけ置くので、閉じると入力と結果の表示は消える。見た目は暫定(ターミナル風)
export function InviteMemberDialog({
  productId,
  open,
  onClose,
}: {
  productId: string
  open: boolean
  onClose: () => void
}) {
  return (
    <Modal open={open} onClose={onClose}>
      <InviteMemberForm productId={productId} />
      <IconButton
        icon={X}
        label="閉じる"
        variant="outline"
        onClick={onClose}
      />
    </Modal>
  )
}
