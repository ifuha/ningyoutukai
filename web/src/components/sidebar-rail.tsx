import { PanelLeftOpen } from 'lucide-react'
import { IconButton } from '#/components/icon-button'
import type { SidebarProduct } from '#/components/sidebar'

// サイドバーをたたんだときの、幅の狭い帯。一番上に「サイドバーを開く」、その下にプロダクトのアイコンを縦に並べる。
// アイコンを押すと、そのプロダクトへ移動する(名前は、ホバーの `title` と `aria-label`。スクロールする並びの中では、独自のツールチップが切れるので、標準のものにする)。
// - アイコンの画像がないプロダクトは、名前の頭文字の丸を出す(サイドバーでは、名前が隣にあるので、空きだけでよかった)
// - いま開いているプロダクトには、枠をつける(`aria-current`)
// - たたんでいない間は、帯は見えない(`collapsed` が false)ので、キーボードの移動からも外す(tabIndex -1)
// - プロダクトが多いときは、アイコンの並びだけがスクロールする(「開く」は上に固定)

/** 頭文字(名前が空なら ?) */
export function productInitial(name: string): string {
  return [...name.trim()][0] ?? '?'
}

function RailProduct({ product, active, collapsed, onSelect }: { product: SidebarProduct; active: boolean; collapsed: boolean; onSelect?: (productId: string) => void }) {
  return (
    <li>
      <button
        type="button"
        aria-label={product.name}
        title={product.name}
        aria-current={active ? 'page' : undefined}
        tabIndex={collapsed ? 0 : -1}
        onClick={() => onSelect?.(product.id)}
        className="flex size-10 cursor-pointer items-center justify-center border-b-2 border-transparent transition-[border-color,background-color] duration-200 ease-out hover:bg-side-item focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink motion-reduce:transition-none aria-[current=page]:border-ink aria-[current=page]:bg-surface"
      >
        {product.avatarUrl ? (
          <img src={product.avatarUrl} alt="" draggable={false} className="size-7 shrink-0 rounded-full object-cover" />
        ) : (
          <span aria-hidden="true" data-rail-initial className="flex size-7 shrink-0 items-center justify-center rounded-full text-s font-medium shadow-box">
            {productInitial(product.name)}
          </span>
        )}
      </button>
    </li>
  )
}

export function SidebarRail({
  products,
  activeProductId,
  collapsed,
  onExpand,
  onSelectProduct,
}: {
  products: SidebarProduct[]
  activeProductId?: string
  collapsed: boolean
  onExpand: () => void
  onSelectProduct?: (productId: string) => void
}) {
  return (
    <>
      <IconButton
        icon={PanelLeftOpen}
        label="サイドバーを開く"
        side="right"
        size="sm"
        onClick={onExpand}
        tabIndex={collapsed ? 0 : -1}
        aria-expanded={false}
        aria-controls="app-sidebar"
      />
      <ul aria-label="プロダクト" className="mt-3 flex min-h-0 w-full flex-col items-center gap-1 overflow-y-auto">
        {products.map((p) => (
          <RailProduct key={p.id} product={p} active={p.id === activeProductId} collapsed={collapsed} onSelect={onSelectProduct} />
        ))}
      </ul>
    </>
  )
}
