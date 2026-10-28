import { Link, createFileRoute } from '@tanstack/react-router'
import { AppShell } from '#/components/app-shell'
import { DotField } from '#/components/dot-field'

// ホーム(`/home`)。ログイン必須。未ログインなら、ログイン画面(`/`)へ戻す(`AppShell` が行う)。
// 番号つきのプロダクトの一覧だけ。配色と枠は、アプリ全体のもの(ライト / ダークに追従、太い枠、角丸なし)
export const Route = createFileRoute('/home')({ component: Home })

const roleLabel = { leader: 'リーダー', member: 'メンバー' } as const

function Home() {
  return (
    <AppShell align="top">
      {({ products }) => {
        const list = products.data ?? []

        return (
          <section aria-label="プロダクト" className="relative z-10 w-full max-w-4xl">
            {/* 背景。サイドバーの右側いっぱいに敷く(アプリ共通のドットの上に重ねる) */}
            <DotField className="pointer-events-none fixed inset-y-0 right-0 left-0 z-0 h-full w-full md:left-60 md:w-[calc(100%-15rem)]" />
            <h1 className="font-mono text-s opacity-70">01 / プロダクト</h1>
            {products.isPending ? (
              <p className="mt-4 text-m opacity-60">読み込み中…</p>
            ) : products.isError ? (
              <p role="alert" className="mt-4 border-l-2 border-ink pl-3 text-m">
                ERR {products.error.message}
              </p>
            ) : list.length === 0 ? (
              <p className="mt-4 text-m opacity-70">
                まだプロダクトがありません。
                <Link
                  to="/products/new"
                  className="underline underline-offset-4 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-ink"
                >
                  最初のプロダクトを作る
                </Link>
              </p>
            ) : (
              <ol className="mt-4 border-t-2 border-ink bg-surface">
                {list.map((p, i) => (
                  <li
                    key={p.productId}
                    className="rise border-b-2 border-ink"
                    style={{ animationDelay: `${i * 70}ms` }}
                  >
                    <Link
                      to="/products/$productId"
                      params={{ productId: p.productId }}
                      className="row-fill group flex min-h-16 items-center gap-6 focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ink"
                    >
                      <span className="w-8 shrink-0 pl-2 font-mono text-s opacity-70 transition-transform duration-200 group-hover:translate-x-1">
                        {String(i + 1).padStart(2, '0')}
                      </span>
                      <span className="min-w-0 flex-1 truncate text-l font-medium">
                        {p.productName}
                      </span>
                      <span className="shrink-0 text-s opacity-70">
                        {roleLabel[p.role]}
                      </span>
                      <span
                        aria-hidden="true"
                        className="w-6 shrink-0 -translate-x-2 font-mono text-m opacity-0 transition-[opacity,transform] duration-200 group-hover:translate-x-0 group-hover:opacity-100 group-focus-visible:translate-x-0 group-focus-visible:opacity-100"
                      >
                        →
                      </span>
                    </Link>
                  </li>
                ))}
              </ol>
            )}
          </section>
        )
      }}
    </AppShell>
  )
}
