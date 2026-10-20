import { useQuery } from '@tanstack/react-query'
import { createFileRoute, useNavigate } from '@tanstack/react-router'
import { AppShell } from '#/components/app-shell'
import { Prompt, Terminal } from '#/components/terminal'
import { api, type ProductSummary } from '#/lib/api'

// プロダクトの画面(`/products/$productId`)。ログイン必須。仮の見た目(ターミナル風)
// (Figma のデザイン(ツリーなど)ができたら、入れ替える)
export const Route = createFileRoute('/products/$productId')({
  component: Product,
})

const roleLabel = { leader: 'リーダー', member: 'メンバー' } as const

function Product() {
  const { productId } = Route.useParams()
  const navigate = useNavigate()
  const product = useQuery({
    queryKey: ['products', productId],
    queryFn: () => api<ProductSummary>(`/api/product/${productId}`),
    retry: false,
  })

  return (
    <AppShell activeProductId={productId}>
      {() => (
        <Terminal title="~/ningyoutukai — product">
          <Prompt>cat product</Prompt>
          {product.isPending ? (
            <p className="text-sm opacity-60">読み込み中…</p>
          ) : product.isError ? (
            <p role="alert" className="border-l-2 border-ink pl-3 text-sm">
              ERR {product.error.message}
            </p>
          ) : (
            <>
              <div>
                <p className="text-2xl font-bold break-words">{product.data.productName}</p>
                <p className="mt-1 text-sm opacity-70">
                  {roleLabel[product.data.role]}
                </p>
              </div>
              <div className="space-y-2">
                <Prompt>ls tasks</Prompt>
                <p className="text-sm opacity-60">
                  # タスクは、まだ表示できません(準備中)
                </p>
              </div>
            </>
          )}
          <button
            type="button"
            onClick={() => void navigate({ to: '/home' })}
            className="flex h-[48px] w-full items-center justify-center border-2 border-outline bg-secondary px-4 text-[16px] text-outline transition-transform duration-100 hover:-translate-x-0.5 hover:-translate-y-0.5 hover:shadow-[3px_3px_0_0_var(--color-ink)] focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-ink active:translate-x-0 active:translate-y-0 active:shadow-none"
          >
            ホームへ戻る
          </button>
        </Terminal>
      )}
    </AppShell>
  )
}
