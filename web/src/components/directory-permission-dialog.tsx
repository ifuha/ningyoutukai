import { X } from 'lucide-react'
import { useState } from 'react'
import { IconButton } from '#/components/icon-button'
import { Modal } from '#/components/modal'
import type { DirectoryPermission } from '#/lib/document-api'
import { useDirectoryPermissions, useDocumentActions } from '#/lib/use-product-documents'

// ディレクトリの権限の設定(リーダーだけ)。仕様は docs/v4.0/overview.md
// - 権限は **ディレクトリごと**に、メンバーに付ける: 「読み取りのみ」(既定)/「読み取りと書き込み」
// - **リーダーは全権限**なので、ここには出ない。**権限を渡せるのはリーダーだけ**
// - 書き込み権限があると、そのディレクトリの文書を、作る・編集する・名前を変える・消せる(ディレクトリ自体の操作はリーダーだけ)
// - 割り振られた文書は、読み取りが付く(何も設定していなくても、メンバーは読める)

export type PermissionLevel = 'read' | 'write'

/** 表示(押せるボタンのまとまり)。データを取る `DirectoryPermissionDialog` から使う */
export function DirectoryPermissionList({
  members,
  pendingMemberId,
  onChange,
}: {
  members: DirectoryPermission[]
  pendingMemberId?: string | null
  onChange: (memberId: string, level: PermissionLevel) => void
}) {
  if (members.length === 0) {
    return <p className="text-m opacity-70"># リーダー以外のメンバーがいません(リーダーは、すべての権限を持っています)</p>
  }
  return (
    <ul className="divide-y divide-line">
      {members.map((m) => (
        <li key={m.memberId} className="flex flex-wrap items-center justify-between gap-2 py-2">
          <span className="min-w-0 flex-1 truncate text-m" title={m.userName}>
            {m.userName}
          </span>
          <div role="group" aria-label={`${m.userName} の権限`} className="flex shrink-0">
            {(['read', 'write'] as const).map((level) => (
              <button
                key={level}
                type="button"
                aria-pressed={m.level === level}
                disabled={pendingMemberId === m.memberId}
                onClick={() => m.level !== level && onChange(m.memberId, level)}
                className={`h-8 cursor-pointer px-3 text-m shadow-box disabled:opacity-50 ${m.level === level ? 'bg-ink font-bold text-surface' : 'hover:bg-side-item'}`}
              >
                {level === 'read' ? '読み取りのみ' : '読み取りと書き込み'}
              </button>
            ))}
          </div>
        </li>
      ))}
    </ul>
  )
}

export function DirectoryPermissionDialog({
  productId,
  directory,
  onClose,
}: {
  productId: string
  /** 権限を設定するディレクトリ(なければ閉じている) */
  directory: { directoryId: string; name: string } | null
  onClose: () => void
}) {
  return (
    <Modal open={directory !== null} onClose={onClose}>
      {directory && <Body productId={productId} directory={directory} onClose={onClose} />}
    </Modal>
  )
}

function Body({ productId, directory, onClose }: { productId: string; directory: { directoryId: string; name: string }; onClose: () => void }) {
  const permissions = useDirectoryPermissions(productId, directory.directoryId)
  const actions = useDocumentActions(productId)
  const [pending, setPending] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const change = async (memberId: string, level: PermissionLevel) => {
    setPending(memberId)
    setError(null)
    try {
      await actions.setPermission(directory.directoryId, memberId, level)
    } catch (e) {
      setError(e instanceof Error ? e.message : '変更できませんでした。時間をおいて、もう一度お試しください')
    } finally {
      setPending(null)
    }
  }

  return (
    <div className="space-y-3 bg-panel p-4 text-ink">
      <div className="flex items-start justify-between gap-2">
        <h2 className="min-w-0 text-l font-bold break-words">「{directory.name}」の権限</h2>
        <IconButton icon={X} label="閉じる" size="sm" side="bottom" onClick={onClose} />
      </div>
      <p className="text-s opacity-80">
        書き込みの権限があるメンバーは、このディレクトリの文書を作る・編集する・名前を変える・消せます。何も設定していなければ、読み取りのみです。リーダーは、すべての権限を持っています。
      </p>
      {permissions.isPending ? (
        <p className="text-m opacity-60">読み込み中…</p>
      ) : permissions.isError ? (
        <p role="alert" className="border-l border-line pl-3 text-m">
          ERR {permissions.error.message}
        </p>
      ) : (
        <DirectoryPermissionList members={permissions.data} pendingMemberId={pending} onChange={(id, level) => void change(id, level)} />
      )}
      {error && (
        <p role="alert" className="border-l border-line pl-3 text-m">
          ERR {error}
        </p>
      )}
    </div>
  )
}
