import { createFileRoute, useNavigate } from '@tanstack/react-router'
import { AppShell } from '#/components/app-shell'
import {
  PixelSprite,
  heartSprite,
  puppetSprite,
  starSprite,
} from '#/components/pixel-sprite'
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

// Railway のキャンバスのような、線でつながれたサービスのカード。位置は舞台の %(中心)
const nodes = [
  { name: 'web', x: 16, y: 30, delay: 0 },
  { name: 'api', x: 50, y: 22, delay: -0.7 },
  { name: 'db', x: 84, y: 34, delay: -1.4 },
] as const

// つなぐ線(nodes の添字)
const links = [
  [0, 1],
  [1, 2],
] as const

// 背景のドット絵の小物。位置(%)・種類・またたきの遅れ(秒)
const twinkles = [
  { sprite: starSprite, left: 8, top: 18, delay: 0 },
  { sprite: heartSprite, left: 86, top: 24, delay: -0.8 },
  { sprite: starSprite, left: 22, top: 62, delay: -1.5 },
  { sprite: starSprite, left: 74, top: 56, delay: -0.4 },
  { sprite: heartSprite, left: 40, top: 12, delay: -1.1 },
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
            className="home-stage railway-bg relative h-[60vh] min-h-80 overflow-hidden border-2 border-ink"
          >
            <svg
              className="absolute inset-0 size-full"
              viewBox="0 0 100 100"
              preserveAspectRatio="none"
            >
              {links.map(([a, b]) => (
                <line
                  key={`${a}-${b}`}
                  className="home-link"
                  x1={nodes[a].x}
                  y1={nodes[a].y}
                  x2={nodes[b].x}
                  y2={nodes[b].y}
                  vectorEffect="non-scaling-stroke"
                />
              ))}
            </svg>
            {nodes.map((n) => (
              <div
                key={n.name}
                className="home-node absolute flex items-center gap-2 px-3 py-2 font-mono text-s"
                style={{ left: `${n.x}%`, top: `${n.y}%` }}
              >
                <span
                  className="home-dot"
                  style={{ animationDelay: `${n.delay}s` }}
                />
                {n.name}
              </div>
            ))}
            {twinkles.map((t, i) => (
              <span
                key={i}
                className="home-twinkle absolute"
                style={{
                  left: `${t.left}%`,
                  top: `${t.top}%`,
                  animationDelay: `${t.delay}s`,
                }}
              >
                <PixelSprite rows={t.sprite} pixel={4} />
              </span>
            ))}
            <div className="home-bob absolute bottom-6 left-1/2 -ml-20">
              <PixelSprite rows={puppetSprite} pixel={10} />
            </div>
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
