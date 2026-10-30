import { PanelLeftClose, Plus } from 'lucide-react'
import { IconButton } from '#/components/icon-button'
import { SidebarInvitation } from '#/components/sidebar-invitation'
import { ThemeToggle } from '#/components/theme-toggle'
import type { Invitation } from '#/lib/invitation'

export type SidebarProduct = { id: string; name: string }

// サイドバー(Figma `side-light` / `side-dark`、幅 240px)。角丸は使わない(ユーザーの指定。Figma は 10px)。
// データは、呼び出し側から渡す(api は、ここでは呼ばない)
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
  return (
    <aside className="flex h-screen w-60 shrink-0 flex-col bg-side">
      {/* ロゴ・招待・プロダクト一覧だけがスクロールし、「プロダクト作成」は下に固定する */}
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
              side="right"
              size="sm"
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
            <li className="h-12 text-m leading-[48px] opacity-60">
              読み込み中…
            </li>
          ) : (
            products.map((p) => (
              <li key={p.id}>
                <button
                  type="button"
                  onClick={() => onSelectProduct?.(p.id)}
                  aria-current={p.id === activeProductId ? 'page' : undefined}
                  className="flex h-12 w-full items-center truncate px-2 text-left text-l font-medium hover:bg-side-item aria-[current=page]:bg-side-item"
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
        <div className="mt-2">
          <ThemeToggle />
        </div>
      </div>
    </aside>
  )
}
