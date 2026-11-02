import { MutationCache, QueryCache, QueryClient } from '@tanstack/react-query'
import { handleApiError } from '#/lib/session-expired'
import { useMicrotaskNotifications } from '#/lib/query-scheduler'

// 取得したデータを、画面から離れたあとも、この時間だけ持っておく(既定は 5 分)。
// 戻ってきたときは、持っているデータをすぐに出し、裏で取り直す(staleTime は 0 のまま = 毎回取り直す)。
// ログアウト・別の人のログインでは、`cache-owner.ts` が消す。サーバー(SSR)では、react-query の既定(消さない)のまま
const CACHE_TIME_MS = 30 * 60 * 1000

export function getContext() {
  // データの更新を、同じタスクの中で画面に届ける(位置を確定した直後の「後戻り」を防ぐ)
  useMicrotaskNotifications()
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: typeof window === 'undefined' ? {} : { gcTime: CACHE_TIME_MS },
    },
    queryCache: new QueryCache({ onError: handleApiError }),
    mutationCache: new MutationCache({ onError: handleApiError }),
  })

  return {
    queryClient,
  }
}
export default function TanstackQueryProvider() {}
