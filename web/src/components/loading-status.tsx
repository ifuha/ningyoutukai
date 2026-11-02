import { useEffect, useRef, useState } from 'react'
import { useQueryClient, type QueryClient } from '@tanstack/react-query'
import { initialStatus, queryLabel, step, type Fetching, type StatusState } from '#/lib/loading-status'

/** いま取得中のクエリのうち、利用者に見せるもの(名前が付くもの)を集める */
function collectFetching(queryClient: QueryClient): Fetching[] {
  const out: Fetching[] = []
  for (const q of queryClient.getQueryCache().findAll()) {
    if (q.state.fetchStatus !== 'fetching') continue
    const label = queryLabel(q.queryKey)
    if (label) out.push({ hash: q.queryHash, label, refresh: q.state.data !== undefined })
  }
  return out
}

/**
 * 「いま何を読み込んでいるか」を、画面の上から出す。
 * 0.4 秒以上かかる取得だけを出し、出したら 0.7 秒は残す(`lib/loading-status.ts`)。キャッシュを出したままの取り直しは、「更新中」と出す。
 * 動きを減らす設定のときは、スライドせずに、そのまま出る・消える
 */
export function LoadingStatus() {
  const queryClient = useQueryClient()
  const [lines, setLines] = useState<string[]>([])
  // 閉じる動きの間も、直前の文言を残す(空にすると、スライドの途中で文字が消える)
  const lastLines = useRef<string[]>([])
  if (lines.length > 0) lastLines.current = lines

  useEffect(() => {
    let state: StatusState = initialStatus
    let timer: ReturnType<typeof setTimeout> | undefined
    let last = ''

    const tick = () => {
      if (timer) clearTimeout(timer)
      const now = Date.now()
      const result = step(state, collectFetching(queryClient), now)
      state = result.state
      const key = result.visible.join('\n')
      if (key !== last) {
        last = key
        setLines(result.visible)
      }
      if (result.wakeAt !== null) timer = setTimeout(tick, Math.max(0, result.wakeAt - now))
    }

    tick()
    const unsubscribe = queryClient.getQueryCache().subscribe(tick)
    return () => {
      unsubscribe()
      if (timer) clearTimeout(timer)
    }
  }, [queryClient])

  const open = lines.length > 0
  return (
    <div
      aria-live="polite"
      className="pointer-events-none fixed inset-x-0 top-0 z-50 flex justify-center px-4"
    >
      <div
        data-open={open}
        // 上から滑り出る。閉じているあいだは、見えず、操作にも影響しない
        className="loading-status shadow-box bg-surface px-3 py-2 text-ink"
      >
        <ul className="space-y-1">
          {(open ? lines : lastLines.current).map((line) => (
            <li key={line} className="flex items-center gap-2 text-s">
              <span aria-hidden="true" className="loading-dots">
                {[0, 1, 2].map((n) => (
                  <i key={n} style={{ ['--n' as string]: n }} />
                ))}
              </span>
              {line}
            </li>
          ))}
        </ul>
      </div>
    </div>
  )
}
