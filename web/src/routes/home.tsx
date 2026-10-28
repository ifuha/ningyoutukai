import { createFileRoute, useNavigate } from '@tanstack/react-router'
import { AppShell } from '#/components/app-shell'
import { authClient } from '#/lib/auth-client'

// ホーム(`/home`)。ログイン必須。未ログインなら、ログイン画面(`/`)へ戻す(`AppShell` が行う)。
// プロダクトの一覧はサイドバーにあるので、ここは、あいさつと、操り人形の糸が揺れる飾りだけ
export const Route = createFileRoute('/home')({ component: Home })

// 糸の本数と、揺れの長さ(秒)・遅れ(秒)・糸の長さ(%)。ばらつかせて、一斉に動いて見えないようにする
const strings = [
  { dur: 4.2, delay: 0, len: 46 },
  { dur: 5.1, delay: -1.3, len: 62 },
  { dur: 3.8, delay: -2.4, len: 38 },
  { dur: 4.7, delay: -0.7, len: 72 },
  { dur: 5.6, delay: -3.1, len: 54 },
  { dur: 4.0, delay: -1.9, len: 66 },
  { dur: 4.9, delay: -2.8, len: 42 },
] as const

function Home() {
  const navigate = useNavigate()

  async function signOut() {
    await authClient.signOut()
    void navigate({ to: '/', replace: true })
  }

  return (
    <AppShell align="top">
      {({ user }) => (
        <div className="w-full max-w-4xl space-y-6">
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
              className="h-10 shrink-0 border-2 border-ink px-4 text-m hover:bg-side-item focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink"
            >
              ログアウト
            </button>
          </header>

          {/* 飾り。意味を持たないので、読み上げからは外す */}
          <div
            aria-hidden="true"
            className="home-stage dot-grid relative h-[60vh] min-h-80 overflow-hidden border-2 border-ink"
          >
            <div className="absolute inset-x-0 top-0 flex h-full justify-around px-6">
              {strings.map((s, i) => (
                <div
                  key={i}
                  className="home-string"
                  style={{
                    height: `${s.len}%`,
                    animationDuration: `${s.dur}s`,
                    animationDelay: `${s.delay}s`,
                  }}
                >
                  <span className="home-puppet" />
                </div>
              ))}
            </div>
            <p className="absolute right-4 bottom-3 font-mono text-s opacity-60">
              人形使い<span className="cursor">_</span>
            </p>
          </div>
        </div>
      )}
    </AppShell>
  )
}
