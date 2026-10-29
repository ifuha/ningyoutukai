import { Link, createFileRoute, useNavigate } from '@tanstack/react-router'
import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { AppShell } from '#/components/app-shell'
import { DotField } from '#/components/dot-field'
import { eden, edenData } from '#/lib/eden'
import { authClient } from '#/lib/auth-client'

// ホーム(`/home`)。ログイン必須。未ログインなら、ログイン画面(`/`)へ戻す(`AppShell` が行う)。
// 上にユーザー名・Google カレンダーの連携・ログアウトの細いバー、その下に番号つきのプロダクトの一覧。配色と枠は、アプリ全体のもの(ライト / ダークに追従、太い枠、角丸なし)
export const Route = createFileRoute('/home')({ component: Home })

const roleLabel = { leader: 'リーダー', member: 'メンバー' } as const

const barLink =
  'underline-offset-4 hover:underline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-ink'

function Home() {
  const navigate = useNavigate()
  const { data: session } = authClient.useSession()
  const [calendarLinkError, setCalendarLinkError] = useState(false)
  const calendar = useQuery({
    queryKey: ['google-calendar-status'],
    queryFn: () => edenData(eden().api.calendar.status.get()),
    enabled: Boolean(session?.user),
    retry: false,
  })

  async function signOut() {
    await authClient.signOut()
    void navigate({ to: '/', replace: true })
  }

  async function connectGoogleCalendar() {
    setCalendarLinkError(false)
    const { error } = await authClient.linkSocial({
      provider: 'google',
      scopes: ['https://www.googleapis.com/auth/calendar.events'],
      callbackURL: `${window.location.origin}/home`,
      errorCallbackURL: `${window.location.origin}/home`,
      additionalParams: { access_type: 'offline', prompt: 'consent' },
    })
    if (error) setCalendarLinkError(true)
  }

  return (
    <AppShell align="top">
      {({ user, products }) => {
        const list = products.data ?? []

        return (
          <section aria-label="プロダクト" className="relative z-10 w-full max-w-2xl">
            {/* 背景。サイドバーの右側いっぱいに敷く(アプリ共通のドットの上に重ねる) */}
            <DotField shape="char" className="pointer-events-none fixed inset-y-0 right-0 left-0 -z-10 h-full w-full md:left-60 md:w-[calc(100%-15rem)]" />
            <div className="mb-6 flex flex-wrap items-center justify-between gap-x-6 gap-y-2 font-mono text-s">
              <span className="min-w-0 truncate opacity-70">&gt; {user.name}</span>
              <span className="flex items-center gap-6">
                {calendar.isPending ? (
                  <span className="opacity-60">カレンダー確認中…</span>
                ) : calendar.data?.connected ? (
                  <span className="opacity-70">Googleカレンダー: 連携済み</span>
                ) : (
                  <button
                    type="button"
                    onClick={() => void connectGoogleCalendar()}
                    className={barLink}
                  >
                    Googleカレンダーを連携
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => void signOut()}
                  className="h-8 border border-line bg-surface px-3 hover:bg-side-item focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink"
                >
                  ログアウト
                </button>
              </span>
            </div>
            {calendarLinkError && (
              <p role="alert" className="-mt-6 mb-8 border-l border-line pl-3 text-m">
                Googleカレンダーを連携できませんでした。もう一度お試しください。
              </p>
            )}
            <h1 className="font-mono text-s opacity-70">01 / プロダクト</h1>
            {products.isPending ? (
              <p className="mt-4 text-m opacity-60">読み込み中…</p>
            ) : products.isError ? (
              <p role="alert" className="mt-4 border-l border-line pl-3 text-m">
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
              <ol className="mt-4 border-t border-line bg-surface">
                {list.map((p, i) => (
                  <li
                    key={p.productId}
                    className="rise border-b border-line"
                    style={{ animationDelay: `${i * 70}ms` }}
                  >
                    <Link
                      to="/products/$productId"
                      params={{ productId: p.productId }}
                      className="row-fill group flex min-h-12 items-center gap-5 focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ink"
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
