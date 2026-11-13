import { useState } from 'react'
import { PanelLeftClose, Plus, SlidersHorizontal } from 'lucide-react'
import { IconButton } from '#/components/icon-button'
import { Loading } from '#/components/loading'
import { Logo } from '#/components/logo'
import { SettingsDialog } from '#/components/settings-dialog'
import { SidebarProductRow } from '#/components/sidebar-product-row'
import { SidebarInvitation } from '#/components/sidebar-invitation'
import type { Invitation } from '#/lib/invitation'

// `avatarUrl`: アイコンの画像の URL(なければ代わりの表示)。`isLeader` の行だけ、右クリック(スマホは長押し)でメニューを出す(プロダクト設定)
// `pendingReviewCount`: 確認待ちの数(リーダーのプロダクトだけ。1 以上なら、行とアイコンに赤い点を出す)
export type SidebarProduct = { id: string; name: string; avatarUrl?: string | null; isLeader?: boolean; pendingReviewCount?: number | null }

// サイドバー(Figma `side-light` / `side-dark`、幅 240px)。角丸は使わない(ユーザーの指定。Figma は 10px)。
// データは、呼び出し側から渡す(api は、ここでは呼ばない)。
// 下の「設定」で、設定のモーダルを開く(表示モードなど。開閉の状態は、ここで持つ)
export function Sidebar({
  products,
  invitations = [],
  activeProductId,
  onSelectProduct,
  onOpenProductSettings,
  onCreateProduct,
  onCollapse,
  isLoading = false,
}: {
  products: SidebarProduct[]
  // 自分宛ての保留中の招待。1 件以上あるときだけ、「プロダクト」の上に出す
  invitations?: Invitation[]
  activeProductId?: string
  onSelectProduct?: (productId: string) => void
  // 行のメニューの「プロダクト設定」(そのプロダクトへ移動して、設定のモーダルを開く)
  onOpenProductSettings?: (productId: string) => void
  onCreateProduct?: () => void
  // PC 幅でサイドバーをたたむ(渡したときだけ、ロゴの右にボタンを出す。スマホ幅では出さない)
  onCollapse?: () => void
  isLoading?: boolean
}) {
  const [settingsOpen, setSettingsOpen] = useState(false)

  return (
    <aside className="flex h-screen w-60 shrink-0 flex-col bg-side">
      {/* ロゴ・招待・プロダクト一覧だけがスクロールし、「プロダクト作成」と「設定」は下に固定する */}
      <div className="flex min-h-0 flex-1 flex-col overflow-y-auto pt-4">
      <div className="flex items-center justify-between px-2">
        <Logo className="h-14" />
        {onCollapse && (
          <span className="hidden md:block">
            <IconButton
              icon={PanelLeftClose}
              label="サイドバーをたたむ"
              side="left"
              size="sm"
              onClick={onCollapse}
              aria-expanded
              aria-controls="app-sidebar"
            />
          </span>
        )}
      </div>

      {invitations.length > 0 && (
        <section aria-label="招待" className="mt-4 px-2">
          <p className="text-m font-medium">招待({invitations.length})</p>
          <ul className="mt-[7px] flex flex-col gap-4">
            {invitations.map((i) => (
              <SidebarInvitation key={i.invitationId} invitation={i} />
            ))}
          </ul>
        </section>
      )}

      <nav aria-label="プロダクト" className="mt-4">
        <p className="px-2 text-m">プロダクト</p>
        <ul className="mt-[7px] flex flex-col">
          {isLoading ? (
            <li className="flex h-12 items-center">
              <Loading />
            </li>
          ) : (
            products.map((p) => (
              <SidebarProductRow
                key={p.id}
                productId={p.id}
                name={p.name}
                avatarUrl={p.avatarUrl}
                isLeader={p.isLeader}
                pendingReviewCount={p.pendingReviewCount}
                active={p.id === activeProductId}
                onSelect={onSelectProduct}
                onOpenSettings={onOpenProductSettings}
              />
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