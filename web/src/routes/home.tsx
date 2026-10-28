import { Link, createFileRoute, useNavigate } from '@tanstack/react-router'
import { useRef, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { AppShell } from '#/components/app-shell'
import { eden, edenData } from '#/lib/eden'
import { authClient } from '#/lib/auth-client'

// ホーム(`/home`)。ログイン必須。未ログインなら、ログイン画面(`/`)へ戻す(`AppShell` が行う)。
// Railway の「新規作成」の画面のように、暗い舞台の中央に、検索欄と選択肢の一覧を置く。
// 一覧は、プロダクトの作成、Google カレンダーの連携、既存のプロダクト
export const Route = createFileRoute('/home')({ component: Home })

const roleLabel = { leader: 'リーダー', member: 'メンバー' } as const

const rowClass =
  'group flex w-full items-center gap-4 border border-transparent px-4 py-3 text-left hover:border-violet-400/50 hover:bg-white/5 focus-visible:border-violet-400 focus-visible:bg-white/5 focus-visible:outline-none'

function Row({
  icon,
  title,
  note,
  trailing,
}: {
  icon: string
  title: string
  note?: string
  trailing?: React.ReactNode
}) {
  return (
    <>
      <span
        aria-hidden="true"
        className="flex size-9 shrink-0 items-center justify-center border border-white/20 bg-white/5 font-mono text-m"
      >
        {icon}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-m font-medium">{title}</span>
        {note && <span className="block truncate text-s opacity-60">{note}</span>}
      </span>
      {trailing ?? (
        <span
          aria-hidden="true"
          className="font-mono text-m opacity-0 group-hover:opacity-60 group-focus-visible:opacity-60"
        >
          →
        </span>
      )}
    </>
  )
}

function Home() {
  const navigate = useNavigate()
  const { data: session } = authClient.useSession()
  const [query, setQuery] = useState('')
  const [calendarLinkError, setCalendarLinkError] = useState(false)
  const listRef = useRef<HTMLDivElement>(null)
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
        const showCreate = matches('プロダクトを作成 新規')
        const showCalendar = matches('google カレンダー 連携')
        const nothing =
          products.data !== undefined &&
          !showCreate &&
          !showCalendar &&
          shown.length === 0

        return (
          <div className="relative w-full max-w-4xl overflow-hidden border-2 border-ink">
            <div className="railway-bg flex min-h-[calc(100vh-8rem)] flex-col px-4 py-6 sm:px-8">
              <div className="flex items-center justify-between gap-4 font-mono text-s opacity-70">
                <span className="truncate">&gt; {user.name}</span>
                <button
                  type="button"
                  onClick={() => void signOut()}
                  className="shrink-0 border border-white/30 px-3 py-1 hover:bg-white/10 focus-visible:outline-2 focus-visible:outline-violet-400"
                >
                  ログアウト
                </button>
              </div>

              <div
                className="m-auto w-full max-w-xl py-10"
                onKeyDown={onKeyDown}
              >
                <h1 className="mb-5 text-center text-l font-bold">
                  何から始めますか?
                </h1>

                <div className="border border-white/20 bg-[#1b1829] shadow-[0_0_48px_rgb(139_92_246/0.25)]">
                  <input
                    ref={inputRef}
                    type="search"
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    placeholder="検索…(↑ ↓ で選ぶ)"
                    aria-label="検索"
                    autoFocus
                    className="h-12 w-full border-b border-white/20 bg-transparent px-4 text-l placeholder:opacity-50 focus-visible:outline-none"
                  />

                  <div ref={listRef} className="max-h-[50vh] overflow-y-auto p-2">
                    {showCreate && (
                      <Link to="/products/new" data-row className={rowClass}>
                        <Row
                          icon="＋"
                          title="プロダクトを作成"
                          note="新しいプロダクトを作って、タスクを分ける"
                        />
                      </Link>
                    )}

                    {showCalendar &&
                      (calendar.data?.connected ? (
                        <div className="flex items-center gap-4 px-4 py-3 opacity-80">
                          <Row
                            icon="31"
                            title="Googleカレンダー"
                            note="担当者のメインカレンダーに、期限の予定を追加します"
                            trailing={
                              <span className="border border-emerald-400/60 px-2 text-s text-emerald-300">
                                連携済み
                              </span>
                            }
                          />
                        </div>
                      ) : (
                        <button
                          type="button"
                          data-row
                          disabled={calendar.isPending}
                          onClick={() => void connectGoogleCalendar()}
                          className={`${rowClass} disabled:opacity-50`}
                        >
                          <Row
                            icon="31"
                            title="Googleカレンダーを連携"
                            note={
                              calendar.isPending
                                ? '連携状態を確認中…'
                                : '担当者のメインカレンダーに、期限時刻の予定を追加します'
                            }
                          />
                        </button>
                      ))}
                    {calendarLinkError && (
                      <p role="alert" className="px-4 py-2 text-s text-red-300">
                        Googleカレンダーを連携できませんでした。もう一度お試しください。
                      </p>
                    )}

                    {(products.isPending ||
                      shown.length > 0 ||
                      products.isError) && (
                      <p className="px-4 pt-4 pb-1 font-mono text-s opacity-50">
                        プロダクト
                      </p>
                    )}
                    {products.isPending && (
                      <p className="px-4 py-3 text-m opacity-60">読み込み中…</p>
                    )}
                    {products.isError && (
                      <p role="alert" className="px-4 py-3 text-m text-red-300">
                        ERR {products.error.message}
                      </p>
                    )}
                    {shown.map((p) => (
                      <Link
                        key={p.productId}
                        to="/products/$productId"
                        params={{ productId: p.productId }}
                        data-row
                        className={rowClass}
                      >
                        <Row
                          icon={p.productName.slice(0, 1)}
                          title={p.productName}
                          note={roleLabel[p.role]}
                        />
                      </Link>
                    ))}

                    {nothing && (
                      <p className="px-4 py-6 text-center text-m opacity-60">
                        「{query}」に合うものは、ありません
                      </p>
                    )}
                  </div>
                </div>
              </div>
            </div>
          </div>
        )
      }}
    </AppShell>
  )
}
