import { Link, createFileRoute, useNavigate } from '@tanstack/react-router'
import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { AppShell } from '#/components/app-shell'
import { eden, edenData } from '#/lib/eden'
import { authClient } from '#/lib/auth-client'

// ホーム(`/home`)。ログイン必須。未ログインなら、ログイン画面(`/`)へ戻す(`AppShell` が行う)。
// Figma にホーム画面のフレームを読み出せなかったため、プロダクト画面の流儀に沿った素直な作り
export const Route = createFileRoute('/home')({ component: Home })

const roleLabel = { leader: 'リーダー', member: 'メンバー' } as const

// 影は、枠と同じ色のずらした四角。押せそうに見せ、ホバーで影の分だけ寄る
const cardBase =
  'flex min-h-28 h-full flex-col justify-between gap-4 border-2 border-ink p-5 shadow-[4px_4px_0_0_var(--color-ink)] transition-[transform,box-shadow] duration-100 hover:translate-x-0.5 hover:translate-y-0.5 hover:bg-side-item hover:shadow-[2px_2px_0_0_var(--color-ink)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink'

const ghostButton =
  'h-10 shrink-0 border-2 border-ink px-4 text-m hover:bg-side-item focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink'

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
      {({ user, products }) => (
        <div className="w-full max-w-4xl space-y-10">
          <header className="flex items-end justify-between gap-4 border-b-2 border-ink pb-4">
            <div className="min-w-0">
              <p className="font-mono text-s opacity-70">&gt; ようこそ</p>
              <h1 className="mt-1 truncate text-l leading-normal font-bold">
                {user.name}
              </h1>
            </div>
            <button
              type="button"
              onClick={() => void signOut()}
              className={ghostButton}
            >
              ログアウト
            </button>
          </header>

          <section aria-label="プロダクト" className="space-y-4">
            <div className="flex items-baseline gap-3">
              <h2 className="text-l font-bold">プロダクト</h2>
              {products.data && (
                <span className="font-mono text-s opacity-70">
                  {products.data.length} 件
                </span>
              )}
            </div>
            {products.isPending ? (
              <p className="text-m opacity-60">読み込み中…</p>
            ) : products.isError ? (
              <p role="alert" className="border-l-2 border-ink pl-3 text-m">
                ERR {products.error.message}
              </p>
            ) : (
              <ul className="grid grid-cols-1 gap-5 min-[900px]:grid-cols-2 xl:grid-cols-3">
                {products.data.map((p) => (
                  <li key={p.productId}>
                    <Link
                      to="/products/$productId"
                      params={{ productId: p.productId }}
                      className={cardBase}
                    >
                      <span className="text-l font-medium break-words">
                        {p.productName}
                      </span>
                      <span
                        className={`self-start border px-2 text-s ${
                          p.role === 'leader' ? 'border-ink font-medium' : 'border-ink/50 opacity-70'
                        }`}
                      >
                        {roleLabel[p.role]}
                      </span>
                    </Link>
                  </li>
                ))}
                <li>
                  <Link
                    to="/products/new"
                    className={`${cardBase} items-center justify-center border-dashed text-l font-medium shadow-none hover:shadow-none`}
                  >
                    ＋ プロダクト作成
                  </Link>
                </li>
              </ul>
            )}
          </section>

          <section
            aria-label="Googleカレンダー連携"
            className="flex flex-col gap-3 border-t-2 border-dashed border-ink/40 pt-5 sm:flex-row sm:items-center sm:justify-between"
          >
            <div>
              <h2 className="text-m font-medium">Googleカレンダー</h2>
              <p className="mt-1 text-s opacity-70">
                担当者が連携済みなら、その人のメインカレンダーに期限時刻の予定を追加します。
              </p>
              {calendarLinkError && (
                <p role="alert" className="mt-2 text-m">
                  Googleカレンダーを連携できませんでした。もう一度お試しください。
                </p>
              )}
            </div>
            {calendar.isPending ? (
              <span className="text-s opacity-60">連携状態を確認中…</span>
            ) : calendar.data?.connected ? (
              <span className="shrink-0 border border-ink px-2 text-s font-medium">
                連携済み
              </span>
            ) : (
              <button
                type="button"
                onClick={() => void connectGoogleCalendar()}
                className={ghostButton}
              >
                Googleカレンダーを連携
              </button>
            )}
          </section>
        </div>
      )}
    </AppShell>
  )
}
