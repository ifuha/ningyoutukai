import { useQuery } from '@tanstack/react-query'
import { listSections } from '#/lib/section-api'

// セクションの一覧の取得(F1)。ツリーの取得と同じく、`['products', productId, ...]` のキーで持つ。
// 補助の表示なので、取得に失敗しても、ツリーは出す(`data` が undefined のまま)。再試行はしない

export const sectionsQueryKey = (productId: string) => ['products', productId, 'sections'] as const
export const treeQueryKey = (productId: string) => ['products', productId, 'tree'] as const

export function useSections(productId: string) {
  return useQuery({
    queryKey: sectionsQueryKey(productId),
    queryFn: () => listSections(productId),
    retry: false,
  })
}
