import { useQuery, useQueryClient } from '@tanstack/react-query'
import { fetchUnlessCommitted } from '#/lib/pending-commits'
import { listSections } from '#/lib/section-api'
import { retryDelay, retryTransient } from '#/lib/query-retry'

// セクションの一覧の取得(F1)。ツリーの取得と同じく、`['products', productId, ...]` のキーで持つ。
// 補助の表示なので、取得に失敗しても、ツリーは出す(`data` が undefined のまま)。一時的な失敗は、少し待って、再試行する

export const sectionsQueryKey = (productId: string) => ['products', productId, 'sections'] as const
export const treeQueryKey = (productId: string) => ['products', productId, 'tree'] as const

export function useSections(productId: string) {
  const queryClient = useQueryClient()
  return useQuery({
    queryKey: sectionsQueryKey(productId),
    // 確定と重なった取得の応答(確定の前の状態)は捨てて、画面の値を保つ
    queryFn: () =>
      fetchUnlessCommitted(
        () => listSections(productId),
        () => queryClient.getQueryData(sectionsQueryKey(productId)),
      ),
    retry: retryTransient,
    retryDelay,
  })
}
