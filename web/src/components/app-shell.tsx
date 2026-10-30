import { useEffect } from 'react'
import { useQuery, type UseQueryResult } from '@tanstack/react-query'
import { useNavigate } from '@tanstack/react-router'
import { Menu, PanelLeftOpen } from 'lucide-react'
import { IconButton } from '#/components/icon-button'
import { Sidebar } from '#/components/sidebar'
import { eden, edenData } from '#/lib/eden'
import { authClient } from '#/lib/auth-client'
import { resetSessionExpired } from '#/lib/session-expired'
import { useDrawer } from '#/lib/use-drawer'
import { useSidebarCollapsed } from '#/lib/use-sidebar-collapsed'

/** `GET /api/product` の応答(api の型から取る) */
type ProductList = Awaited<ReturnType<typeof listProducts>>
const listProducts = () => edenData(eden().api.product.get())

type SessionUser = NonNullable<
  ReturnType<typeof authClient.useSession>['data']
>['user']

// サイドバーつきの共通の枠(ログイン必須)。未ログインなら、ログイン画面(`/`)へ戻す。
// 中身(右側の `main`)は、ログイン中のユーザーと、プロダクト一覧を受け取る関数で渡す
export function AppShell({
  activeProductId,
  align = 'center',
  children,
}: {
  activeProductId?: string
  // 'center': 縦横とも中央(既定)。'top': 縦は上から、横だけ中央
  // 'full': 余白もスクロールもなし。中身がメイン領域いっぱいに広がる(ツリーのキャンバス用)
  align?: 'center' | 'top' | 'full'
  children: (ctx: {
    user: SessionUser
    products: UseQueryResult<ProductList>
  }) => React.ReactNode
}) {
  const { data: session, isPending } = authClient.useSession()
  const navigate = useNavigate()
  const drawer = useDrawer()
  const sidebar = useSidebarCollapsed()

  useEffect(() => {
    if (!isPending && !session?.user) void navigate({ to: '/', replace: true })
  }, [isPending, session?.user, navigate])

  // ログインできている間は、401 の検知を、次のために戻しておく
  const userId = session?.user.id
  useEffect(() => {
    if (userId) resetSessionExpired()
  }, [userId])

  // 所属しているプロダクトの一覧(api に、ログインの cookie が届くかの確認も兼ねる)
  const products = useQuery({
    queryKey: ['products'],
    queryFn: listProducts,
    enabled: Boolean(session?.user),
    retry: false,
  })

  // 自分宛ての保留中の招待(サイドバーに出す。ホームの「招待」と、同じクエリを共有する)
  const invitations = useQuery({
    queryKey: ['invitations'],
    queryFn: () => edenData(eden().api.invitation.get()),
    enabled: Boolean(session?.user),
    retry: false,
  })

  if (isPending || !session?.user) return <main className="dot-grid h-screen" />

  return (
    <div className="flex h-screen flex-col md:flex-row">
      <header className="flex h-12 shrink-0 items-center gap-3 border-b border-line px-2 md:hidden">
        <span
          ref={(el) => {
            drawer.buttonRef.current = el?.querySelector('button') ?? null
          }}
        >
          <IconButton
            icon={Menu}
            label="メニューを開く"
            side="bottom"
            onClick={() => drawer.setOpen(true)}
            aria-expanded={drawer.open}
            aria-controls="app-sidebar"
          />
        </span>
        <p className="text-l font-semibold">人形使い</p>
      </header>
      {drawer.open && (
        <div
          aria-hidden="true"
          onClick={drawer.close}
          className="fixed inset-0 z-30 bg-black/50 md:hidden"
        />
      )}
      {/* PC 幅でたたんでいるとき: 開くボタンだけを、左上に出す */}
      {sidebar.collapsed && (
        <div className="fixed top-2 left-2 z-20 hidden md:block">
          <IconButton
            icon={PanelLeftOpen}
            label="サイドバーを開く"
            side="right"
            variant="outline"
            onClick={() => sidebar.set(false)}
            aria-expanded={false}
            aria-controls="app-sidebar"
          />
        </div>
      )}
      {/* スマホ幅: 画面の外に隠し、開くと左から重ねる。md 以上: 左に表示(たたむと消える) */}
      <div
        id="app-sidebar"
        className={`fixed inset-y-0 left-0 z-40 max-w-[80vw] transition-transform md:static md:max-w-none md:translate-x-0 ${sidebar.collapsed ? 'md:hidden' : 'md:visible'} ${drawer.open ? 'translate-x-0' : 'invisible -translate-x-full'}`}
      >
        <Sidebar
          products={(products.data ?? []).map((p) => ({
            id: p.productId,
            name: p.productName,
          }))}
          invitations={invitations.data}
          onCollapse={() => sidebar.set(true)}
          isLoading={products.isPending}
          activeProductId={activeProductId}
          onSelectProduct={(productId) => {
            drawer.close()
            void navigate({ to: '/products/$productId', params: { productId } })
          }}
          onCreateProduct={() => {
            drawer.close()
            void navigate({ to: '/products/new' })
          }}
        />
      </div>
      {align === 'full' ? (
        <main className="dot-grid min-h-0 min-w-0 flex-1 overflow-hidden">
          {children({ user: session.user, products })}
        </main>
      ) : (
      <main className="dot-grid flex min-h-0 min-w-0 flex-1 overflow-y-auto px-4">
        <div
          className={`${align === 'top' ? 'mx-auto' : 'm-auto'} flex w-full justify-center py-6`}
        >
          {children({ user: session.user, products })}
        </div>
      </main>
      )}
    </div>
  )
}
