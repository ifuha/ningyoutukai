import { MutationCache, QueryCache, QueryClient } from '@tanstack/react-query'
import { handleApiError } from '#/lib/session-expired'
import { useMicrotaskNotifications } from '#/lib/query-scheduler'

export function getContext() {
  // データの更新を、同じタスクの中で画面に届ける(位置を確定した直後の「後戻り」を防ぐ)
  useMicrotaskNotifications()
  const queryClient = new QueryClient({
    queryCache: new QueryCache({ onError: handleApiError }),
    mutationCache: new MutationCache({ onError: handleApiError }),
  })

  return {
    queryClient,
  }
}
export default function TanstackQueryProvider() {}
