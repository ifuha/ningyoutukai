import { useState } from 'react'
import { PanelLeftClose, Plus, SlidersHorizontal } from 'lucide-react'
import { IconButton } from '#/components/icon-button'
import { Loading } from '#/components/loading'
import { SettingsDialog } from '#/components/settings-dialog'
import { SidebarInvitation } from '#/components/sidebar-invitation'
import type { Invitation } from '#/lib/invitation'

export type SidebarProduct = { id: string; name: string }

// サイドバー(Figma `side-light` / `side-dark`、幅 240px)。角丸は使わない(ユーザーの指定。Figma は 10px)。
// データは、呼び出し側から渡す(api は、ここでは呼ばない)。
// 下の「設定」で、設定のモーダルを開く(表示モードなど。開閉の状態は、ここで持つ)
export function Sidebar({
  products,
  invitations = [],
  activeProductId,
  onSelectProduct,
  onCreateProduct,
  onCollapse,
  isLoading = false,
}: {
  products: SidebarProduct[]
  // 自分宛ての保留中の招待。1 件以上あるときだけ、「プロダクト」の上に出す
  invitations?: Invitation[]
  activeProductId?: string
  onSelectProduct?: (productId: string) => void
  onCreateProduct?: () => void
  // PC 幅でサイドバーをたたむ(渡したときだけ、ロゴの右にボタンを出す。スマホ幅では出さない)
  onCollapse?: () => void
  isLoading?: boolean
}) {
  const [settingsOpen, setSettingsOpen] = useState(false)

  return (
    <aside className="flex h-screen w-60 shrink-0 flex-col bg-side">
      {/* ロゴ・招待・プロダクト一覧だけがスクロールし、「プロダクト作成」と「設定」は下に固定する */}
      <div className="flex min-h-0 flex-1 flex-col overflow-y-auto px-2 pt-4">
      <div className="flex items-center justify-between">
        <p className="text-l leading-normal font-semibold">
          人形使い
        </p>
        {onCollapse && (
          <span className="hidden md:block">
            <IconButton
              icon={PanelLeftClose}
              label="サイドバーをたたむ"
              side="left"
              variant="outline"
              onClick={onCollapse}
              aria-expanded
              aria-controls="app-sidebar"
            />
          </span>
        )}
      </div>

      {invitations.length > 0 && (
        <section aria-label="招待" className="mt-4">
          <p className="text-m font-medium">招待({invitations.length})</p>
          <ul className="mt-[7px] flex flex-col gap-4">
            {invitations.map((i) => (
              <SidebarInvitation key={i.invitationId} invitation={i} />
            ))}
          </ul>
        </section>
      )}

      <nav aria-label="プロダクト" className="mt-4">
        <p className="text-m">プロダクト</p>
        <ul className="mt-[7px] flex flex-col gap-2">
          {isLoading ? (
            <li className="flex h-12 items-center">
              <Loading />
            </li>
          ) : (
            products.map((p) => (
              <li key={p.id}>
                <button
                  type="button"
                  onClick={() => onSelectProduct?.(p.id)}
                  aria-current={p.id === activeProductId ? 'page' : undefined}
                  className="flex h-12 w-full items-center truncate border-b-2 border-transparent px-2 text-left text-l font-medium hover:bg-side-item aria-[current=page]:border-ink aria-[current=page]:bg-side-item"
                >
                  <span className="truncate">{p.name}</span>
                </button>
              </li>
            ))
          )}
        </ul>
      </nav>
      </div>

      <div className="shrink-0 px-2 pt-2 pb-3">
        <div className="flex justify-center">
          <IconButton
            icon={Plus}
            label="プロダクト作成"
            showLabel
            block
            variant="outline"
            onClick={() => onCreateProduct?.()}
          />
        </div>
        <div className="mt-2 flex justify-center">
          <IconButton
            icon={SlidersHorizontal}
            label="設定"
            showLabel
            block
            variant="outline"
            onClick={() => setSettingsOpen(true)}
          />
        </div>
      </div>
      <SettingsDialog open={settingsOpen} onClose={() => setSettingsOpen(false)} />
    </aside>
  )
}