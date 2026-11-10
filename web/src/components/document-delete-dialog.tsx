import { Trash2, X } from 'lucide-react'
import { IconButton } from '#/components/icon-button'
import { Modal } from '#/components/modal'

// 文書の削除の確認(モーダル)。`name` が null の間は閉じている。削除すると、全ての版が消え、戻せない(ごみ箱はない)
export function DocumentDeleteDialog({ name, pending = false, onConfirm, onClose }: { name: string | null; pending?: boolean; onConfirm: () => void; onClose: () => void }) {
  return (
    <Modal open={name !== null} onClose={onClose} padded={false}>
      {name !== null && (
        <div className="space-y-2 p-2 text-ink">
          <h2 className="text-l font-black break-words">「{name}」を削除しますか?</h2>
          <p className="text-m">全ての版が消え、戻せません。</p>
          <div className="flex items-center justify-end gap-1">
            <IconButton icon={X} label="やめる" showLabel variant="outline" disabled={pending} onClick={onClose} />
            <IconButton icon={Trash2} label="削除する" showLabel variant="danger-solid" disabled={pending} onClick={onConfirm} />
          </div>
        </div>
      )}
    </Modal>
  )
}
