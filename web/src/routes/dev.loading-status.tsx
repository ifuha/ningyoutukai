import { useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { createFileRoute, notFound } from '@tanstack/react-router'
import { ThemeToggle } from '#/components/theme-toggle'

// 「いま何を読み込んでいるか」を、画面の上に出す表示(`LoadingStatus`)を試すページ(`/dev/loading-status`)。
// ボタンで、疑似的な取得を始める。実際の取得と同じ仕組み(react-query)で動くので、画面の上の表示も同じ動きをする。
// 開発サーバーでだけ見られる。本番のビルドでは、見つかりません(404)になる
export const Route = createFileRoute('/dev/loading-status')({
  beforeLoad: () => {
    if (!import.meta.env.DEV) throw notFound()
  },
  component: DevLoadingStatus,
})

const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms))

type Demo = { title: string; note: string; run: (start: (key: unknown[], ms: number) => Promise<unknown>) => Promise<unknown> }

const demos: Demo[] = [
  { title: 'プロダクト一覧(2.5 秒)', note: '初めての取得。「プロダクト一覧を読み込み中」', run: (s) => s(['products'], 2500) },
  { title: 'タスクのツリー(1.5 秒)', note: '「タスクのツリーを読み込み中」', run: (s) => s(['products', 'demo', 'tree'], 1500) },
  {
    title: '3 つ同時(1 → 2 → 3 秒)',
    note: '上に、3 行並ぶ。終わったものから、消えていく',
    run: (s) => Promise.all([s(['products', 'demo', 'sections'], 1000), s(['invitations'], 2000), s(['google-calendar-status'], 3000)]),
  },
  { title: '一瞬(0.2 秒)', note: '0.4 秒より短いので、何も出ない(ちらつかない)', run: (s) => s(['products', 'demo', 'task_kinds'], 200) },
  { title: '定期的な確認(3 秒)', note: '他の人の変更を見に行く処理。出さない', run: (s) => s(['product-revision', 'demo'], 3000) },
]

function DevLoadingStatus() {
  const queryClient = useQueryClient()
  const [runs, setRuns] = useState(0)

  // 取得は、毎回 staleTime 0 で取りにいく。すでにデータがある(2 回目以降)と、「更新中」と出る
  const start = (key: unknown[], ms: number) =>
    queryClient.fetchQuery({
      queryKey: key,
      queryFn: async () => {
        await sleep(ms)
        return { at: Date.now() }
      },
      staleTime: 0,
    })

  return (
    <main className="min-h-screen bg-surface p-6 text-ink sm:p-10">
      <div className="mx-auto max-w-2xl space-y-8">
        <header className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <h1 className="text-l font-bold">いま読み込んでいるものの表示</h1>
            <p className="mt-1 text-m opacity-70">開発用のページです(本番では、見つかりません)。画面の上を見ていてください。</p>
          </div>
          <ThemeToggle />
        </header>

        <ul className="space-y-3">
          {demos.map((d) => (
            <li key={d.title} className="flex flex-wrap items-center justify-between gap-3 border border-line p-4">
              <div>
                <p className="text-m font-bold">{d.title}</p>
                <p className="mt-1 text-s opacity-60">{d.note}</p>
              </div>
              <button
                type="button"
                className="shadow-box px-3 py-1 text-m hover:bg-ink/5"
                onClick={() => {
                  setRuns((n) => n + 1)
                  void d.run(start)
                }}
              >
                始める
              </button>
            </li>
          ))}
        </ul>

        <p className="text-s opacity-60">
          2 回目以降は、キャッシュがあるので「…を更新中」と出ます(1 回目は「…を読み込み中」)。始めた回数: {runs}
        </p>
      </div>
    </main>
  )
}
