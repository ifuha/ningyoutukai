import { Link, createFileRoute, useNavigate } from '@tanstack/react-router'
import { useRef, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { AppShell } from '#/components/app-shell'
import { eden, edenData } from '#/lib/eden'
import { authClient } from '#/lib/auth-client'

// ホーム(`/home`)。ログイン必須。未ログインなら、ログイン画面(`/`)へ戻す(`AppShell` が行う)。
// 検索欄と、行の一覧(プロダクトの作成、Google カレンダーの連携、既存のプロダクト)だけの、静かな作り。
// 配色と枠は、アプリ全体(太い枠、角丸なし)に合わせる
export const Route = createFileRoute('/home')({ component: Home })

const roleLabel = { leader: 'リーダー', member: 'メンバー' } as const

const rowClass =
  'flex min-h-12 w-full items-center justify-between gap-4 px-4 text-left text-m hover:bg-side-item focus-visible:bg-side-item focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ink'

function Home() {
  const navigate = useNavigate()
  const { data: session } = authClient.useSession()
  const [query, setQuery] = useState('')
  const [calendarLinkError, setCalendarLinkError] = useState(false)
  const listRef = useRef<HTMLUListElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)
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

  // ↑ ↓ で、検索欄と一覧の行のあいだを移る(Enter は、リンク・ボタンの標準の動き)
  function onKeyDown(e: React.KeyboardEvent) {
    if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return
    const rows = Array.from(
      listRef.current?.querySelectorAll<HTMLElement>('[data-row]') ?? [],
    )
    const focusables = [inputRef.current, ...rows].filter(
      (el): el is HTMLElement => el !== null,
    )
    const at = focusables.indexOf(document.activeElement as HTMLElement)
    const next = focusables[at + (e.key === 'ArrowDown' ? 1 : -1)]
    if (next) {
      e.preventDefault()
      next.focus()
    }
  }

  const q = query.trim().toLowerCase()
  const matches = (text: string) => q === '' || text.toLowerCase().includes(q)

  return (
    <AppShell align="top">
      {({ user, products }) => {
        const shown = (products.data ?? []).filter((p) => matches(p.productName))
        const showCalendar = matches('google カレンダー 連携')
        const nothing = !matches('プロダクト 作成') && !showCalendar && shown.length === 0

        return (
          <div className="w-full max-w-2xl space-y-6" onKeyDown={onKeyDown}>
            <header className="flex items-center justify-between gap-4">
              <h1 className="min-w-0 truncate text-l font-bold">{user.name}</h1>
              <button
                type="button"
                onClick={() => void signOut()}
                className="h-10 shrink-0 border-2 border-ink px-4 text-m hover:bg-side-item focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink"
              >
                ログアウト
              </button>
            </header>

            <input
              ref={inputRef}
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="プロダクトを検索"
              aria-label="プロダクトを検索"
              autoFocus
              className="h-12 w-full border-2 border-ink bg-surface px-4 text-l placeholder:opacity-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink"
            />

            <ul
              ref={listRef}
              className="divide-y-2 divide-ink border-2 border-ink"
            >
              {matches('プロダクト 作成') && (
                <li>
                  <Link to="/products/new" data-row className={rowClass}>
                    <span className="font-medium">プロダクトを作成</span>
                    <span aria-hidden="true">＋</span>
                  </Link>
                </li>
              )}

              {products.isPending && (
                <li className="flex min-h-12 items-center px-4 text-m opacity-60">
                  読み込み中…
                </li>
              )}
              {products.isError && (
                <li
                  role="alert"
                  className="flex min-h-12 items-center px-4 text-m"
                >
                  ERR {products.error.message}
                </li>
              )}
              {shown.map((p) => (
                <li key={p.productId}>
                  <Link
                    to="/products/$productId"
                    params={{ productId: p.productId }}
                    data-row
                    className={rowClass}
                  >
                    <span className="min-w-0 truncate font-medium">
                      {p.productName}
                    </span>
                    <span className="shrink-0 text-s opacity-70">
                      {roleLabel[p.role]}
                    </span>
                  </Link>
                </li>
              ))}

              {showCalendar && (
                <li>
                  {calendar.data?.connected ? (
                    <div className="flex min-h-12 items-center justify-between gap-4 px-4 text-m">
                      <span>Googleカレンダー</span>
                      <span className="text-s opacity-70">連携済み</span>
                    </div>
                  ) : (
                    <button
                      type="button"
                      data-row
                      disabled={calendar.isPending}
                      onClick={() => void connectGoogleCalendar()}
                      className={`${rowClass} disabled:opacity-60`}
                    >
                      <span>Googleカレンダーを連携</span>
                      {calendar.isPending && (
                        <span className="text-s opacity-70">確認中…</span>
                      )}
                    </button>
                  )}
                </li>
              )}

              {nothing && (
                <li className="flex min-h-12 items-center px-4 text-m opacity-60">
                  「{query}」に合うものはありません
                </li>
              )}
            </ul>

            {calendarLinkError && (
              <p role="alert" className="border-l-2 border-ink pl-3 text-m">
                Googleカレンダーを連携できませんでした。もう一度お試しください。
              </p>
            )}
          </div>
        )
      }}
    </AppShell>
  )
}
