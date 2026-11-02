import { useState } from 'react'
import { createFileRoute, notFound } from '@tanstack/react-router'
import { Loading } from '#/components/loading'
import { ThemeToggle } from '#/components/theme-toggle'

// 読み込み中の表示(`<Loading />`)を、画面ごとに見比べるための確認用ページ(`/dev/loading`)。
// 開発サーバー(`import.meta.env.DEV`)でだけ見られる。本番のビルドでは、見つかりません(404)になる
export const Route = createFileRoute('/dev/loading')({
  beforeLoad: () => {
    if (!import.meta.env.DEV) throw notFound()
  },
  component: DevLoading,
})

function Sample({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="space-y-3">
      <h2 className="text-s font-mono opacity-70">{title}</h2>
      {children}
    </section>
  )
}

function DevLoading() {
  const [paused, setPaused] = useState(false)

  return (
    <main className="min-h-screen bg-surface p-6 text-ink sm:p-10">
      {/* 止めると、動きの途中の形をじっくり見られる */}
      {paused && <style>{'.loading-dots > i { animation-play-state: paused !important; }'}</style>}
      <div className="mx-auto max-w-2xl space-y-10">
        <header className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <h1 className="text-l font-bold">読み込み中の表示</h1>
            <p className="mt-1 text-m opacity-70">開発用のページです(本番では、見つかりません)。</p>
          </div>
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => setPaused((p) => !p)}
              className="shadow-box px-3 py-1 text-m hover:bg-ink/5"
              aria-pressed={paused}
            >
              {paused ? '動かす' : '止める'}
            </button>
            <ThemeToggle />
          </div>
        </header>

        <Sample title="そのまま">
          <Loading />
        </Sample>

        <Sample title="大きい文字の中(プロダクト画面の見出し)">
          <div className="border border-line p-4">
            <div className="text-l">
              <Loading />
            </div>
          </div>
        </Sample>

        <Sample title="サイドバーの一覧(幅 240px)">
          <div className="w-60 border border-line bg-side p-3">
            <p className="text-m">プロダクト</p>
            <ul className="mt-[7px]">
              <li className="flex h-12 items-center">
                <Loading />
              </li>
            </ul>
          </div>
        </Sample>

        <Sample title="ダイアログの中(種類の管理)">
          <div className="max-w-sm border border-line bg-surface p-4">
            <p className="mb-3 text-m font-bold">種類の管理</p>
            <Loading />
          </div>
        </Sample>

        <Sample title="文言を変えたとき">
          <Loading label="タスクを読み込んでいます" />
        </Sample>
      </div>
    </main>
  )
}
