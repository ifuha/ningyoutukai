import { Save, X } from 'lucide-react'
import { IconButton } from '#/components/icon-button'
import { Modal } from '#/components/modal'

export type SaveMode = 'new' | 'overwrite'

// 文書の保存の確認(モーダル): 新しい版として残すか、いまの版を上書きするか。上書きすると、置き換える前の本文には戻せない
export function SaveModeDialog({ open, onChoose, onClose }: { open: boolean; onChoose: (mode: SaveMode) => void; onClose: () => void }) {
  return (
    <Modal open={open} onClose={onClose}>
      {open && (
        <div className="space-y-3 bg-panel p-4 text-ink">
          <div className="flex items-start justify-between gap-2">
            <h2 className="min-w-0 text-l font-bold">どちらで保存しますか?</h2>
            <IconButton icon={X} label="閉じる" size="sm" side="bottom" onClick={onClose} />
          </div>
          <ul className="space-y-1 text-s opacity-80">
            <li>新しい版として残す: 前の版は履歴に残ります</li>
            <li>いまの版を上書き: 版は増えません。置き換える前の本文には戻せません</li>
          </ul>
          <div className="flex flex-wrap justify-end gap-2">
            <IconButton icon={X} label="やめる" showLabel variant="outline" onClick={onClose} />
            <IconButton icon={Save} label="いまの版を上書き" showLabel variant="outline" onClick={() => onChoose('overwrite')} />
            <IconButton icon={Save} label="新しい版として残す" showLabel variant="solid" onClick={() => onChoose('new')} />
          </div>
        </div>
      )}
    </Modal>
  )
}
