import { Plus } from 'lucide-react'
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
  isLoading = false,
}: {
  products: SidebarProduct[]
  // 自分宛ての保留中の招待。1 件以上あるときだけ、「プロダクト」の上に出す
  invitations?: Invitation[]
  activeProductId?: string
  onSelectProduct?: (productId: string) => void
  onCreateProduct?: () => void
  isLoading?: boolean
}) {
  return (
    <aside className="flex h-screen w-60 shrink-0 flex-col bg-side">
      {/* ロゴ・招待・プロダクト一覧だけがスクロールし、「プロダクト作成」は下に固定する */}
      <div className="flex min-h-0 flex-1 flex-col overflow-y-auto px-4 pt-[26px]">
      <p className="text-l leading-normal font-semibold">
        人形使い
      </p>

      {invitations.length > 0 && (
        <section aria-label="招待" className="mt-[26px]">
          <p className="text-m font-medium">招待({invitations.length})</p>
          <ul className="mt-[7px] flex flex-col gap-4">
            {invitations.map((i) => (
              <SidebarInvitation key={i.invitationId} invitation={i} />
            ))}
          </ul>
        </section>
      )}

      <nav aria-label="プロダクト" className="mt-[26px]">
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
                  className="flex h-12 w-full items-center truncate px-3 text-left text-l font-medium hover:bg-side-item aria-[current=page]:bg-side-item"
                >
                  <span className="truncate">{p.name}</span>
                </button>
              </li>
            ))
          )}
        </ul>
      </nav>
      </div>

      <div className="shrink-0 px-4 pt-3 pb-6">
        <button
          type="button"
          onClick={() => onCreateProduct?.()}
          className="flex h-12 w-full items-center justify-center gap-3 border border-dashed border-line text-l font-medium hover:bg-side-item"
        >
          <PlusIcon />
          プロダクト作成
        </button>
        <div className="mt-3">
          <ThemeToggle />
        </div>
      </div>
    </aside>
  )
}
