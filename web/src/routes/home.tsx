import { Link, createFileRoute, useNavigate } from '@tanstack/react-router'
import { useEffect, useRef, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { AppShell } from '#/components/app-shell'
import { eden, edenData } from '#/lib/eden'
import { authClient } from '#/lib/auth-client'

// ホーム(`/home`)。ログイン必須。未ログインなら、ログイン画面(`/`)へ戻す(`AppShell` が行う)。
// TypeSafe AI の Jev のページのように、大きな見出し、3 つの数字、番号つきの一覧、小さなフッターを、
// 縦に積む。配色と枠は、アプリ全体のもの(ライト / ダークに追従、太い枠、角丸なし)
export const Route = createFileRoute('/home')({ component: Home })

const roleLabel = { leader: 'リーダー', member: 'メンバー' } as const

const linkClass =
  'link-grow focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-ink'

// 0 から目標の値まで、数え上げる。「動きを減らす」設定のときは、すぐ目標の値にする
function CountUp({ value }: { value: number }) {
  const [shown, setShown] = useState(0)
  useEffect(() => {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      setShown(value)
      return
    }
    const start = performance.now()
    const duration = 800
    let frame = 0
    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / duration)
      setShown(Math.round(value * (1 - (1 - t) ** 3)))
      if (t < 1) frame = requestAnimationFrame(tick)
    }
    frame = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(frame)
  }, [value])
  return <>{shown}</>
}

// 画面に入ったときに、一度だけ下からふわっと出る(delay は、並べたときの時間差、ms)
function Reveal({
  children,
  delay = 0,
  className = '',
  as: Tag = 'div',
}: {
  children: React.ReactNode
  delay?: number
  className?: string
  as?: 'div' | 'section' | 'li'
}) {
  const ref = useRef<HTMLElement>(null)
  const [seen, setSeen] = useState(false)
  useEffect(() => {
    const el = ref.current
    if (!el) return
    const io = new IntersectionObserver(
      ([entry]) => {
        if (entry?.isIntersecting) {
          setSeen(true)
          io.disconnect()
        }
      },
      { threshold: 0.15 },
    )
    io.observe(el)
    return () => io.disconnect()
  }, [])
  return (
    <Tag
      ref={ref as React.RefObject<never>}
      className={`reveal ${seen ? 'is-in' : ''} ${className}`}
      style={{ transitionDelay: `${delay}ms` }}
    >
      {children}
    </Tag>
  )
}

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
        const leading = list.filter((p) => p.role === 'leader').length

        return (
          <div className="w-full max-w-4xl">
            <nav
              aria-label="ホーム"
              className="rise flex items-center justify-between gap-4 pb-16 font-mono text-s"
            >
              <span>人形使い</span>
              <span className="flex items-center gap-6">
                <Link to="/products/new" className={linkClass}>
                  プロダクトを作成
                </Link>
                <button
                  type="button"
                  onClick={() => void signOut()}
                  className={linkClass}
                >
                  ログアウト
                </button>
              </span>
            </nav>

            <header>
              <p className="font-mono text-s opacity-70">
                &gt; {user.name}
                <span className="cursor">_</span>
              </p>
              <h1 className="mt-4 text-display font-bold break-words">
                <span className="line-mask">
                  <span className="line-up" style={{ animationDelay: '100ms' }}>
                    動かす前に、
                  </span>
                </span>
                <span className="line-mask">
                  <span className="line-up" style={{ animationDelay: '260ms' }}>
                    誰が何を持つかを決める。
                  </span>
                </span>
              </h1>
              <p
                className="rise mt-6 max-w-xl text-m opacity-70"
                style={{ animationDelay: '520ms' }}
              >
                プロダクトごとにタスクを分け、担当者と期限を決めて、進み具合を一つの画面で見る。
              </p>
            </header>

            <section
              aria-label="いまの状況"
              className="stats-line mt-20 grid grid-cols-1 border-t-2 border-ink sm:grid-cols-3"
            >
              <Reveal className="border-b-2 border-ink py-6 sm:border-b-0 sm:pr-6">
                <p className="text-display font-bold">
                  {products.isPending ? '–' : <CountUp value={list.length} />}
                </p>
                <p className="mt-2 text-m font-medium">プロダクト</p>
                <p className="text-s opacity-70">参加しているもの</p>
              </Reveal>
              <Reveal
                delay={120}
                className="border-b-2 border-ink py-6 sm:border-b-0 sm:border-l-2 sm:px-6"
              >
                <p className="text-display font-bold">
                  {products.isPending ? '–' : <CountUp value={leading} />}
                </p>
                <p className="mt-2 text-m font-medium">リーダー</p>
                <p className="text-s opacity-70">自分が率いているもの</p>
              </Reveal>
              <Reveal delay={240} className="py-6 sm:border-l-2 sm:border-ink sm:pl-6">
                <p className="text-display font-bold">
                  {calendar.isPending ? '–' : calendar.data?.connected ? 'ON' : 'OFF'}
                </p>
                <p className="mt-2 text-m font-medium">Googleカレンダー</p>
                {calendar.data?.connected ? (
                  <p className="text-s opacity-70">期限の予定を追加します</p>
                ) : (
                  <button
                    type="button"
                    disabled={calendar.isPending}
                    onClick={() => void connectGoogleCalendar()}
                    className={`${linkClass} text-s disabled:opacity-50`}
                  >
                    連携する →
                  </button>
                )}
                {calendarLinkError && (
                  <p role="alert" className="mt-2 text-s">
                    連携できませんでした。もう一度お試しください。
                  </p>
                )}
              </Reveal>
            </section>

            <Reveal as="section" className="mt-20">
              <h2 className="font-mono text-s opacity-70">01 / プロダクト</h2>
              {products.isPending ? (
                <p className="mt-4 text-m opacity-60">読み込み中…</p>
              ) : products.isError ? (
                <p role="alert" className="mt-4 border-l-2 border-ink pl-3 text-m">
                  ERR {products.error.message}
                </p>
              ) : list.length === 0 ? (
                <p className="mt-4 text-m opacity-70">
                  まだプロダクトがありません。
                  <Link to="/products/new" className={`${linkClass} underline`}>
                    最初のプロダクトを作る
                  </Link>
                </p>
              ) : (
                <ol className="mt-4 border-t-2 border-ink">
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
            </Reveal>

            <footer className="rise mt-24 flex items-center justify-between gap-4 border-t-2 border-ink pt-4 font-mono text-s opacity-70">
              <span>人形使い</span>
              <span>Version 2.0</span>
            </footer>
          </div>
        )
      }}
    </AppShell>
  )
}
