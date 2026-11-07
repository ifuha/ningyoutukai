import { useQuery, useQueryClient } from '@tanstack/react-query'
import { createProductComment, deleteProductComment, listProductComments, updateProductComment } from '#/lib/comment-api'
import type { NewProductComment, ProductComment, ProductCommentPatch } from '#/lib/comment-api'
import { fetchUnlessCommitted } from '#/lib/pending-commits'
import { retryDelay, retryTransient } from '#/lib/query-retry'

export const productCommentsQueryKey = (productId: string) => ['products', productId, 'comments'] as const
export function useProductComments(productId: string) {
  const client = useQueryClient()
  return useQuery({ queryKey: productCommentsQueryKey(productId), queryFn: () => fetchUnlessCommitted(() => listProductComments(productId), () => client.getQueryData(productCommentsQueryKey(productId))), retry: retryTransient, retryDelay })
}

// 作成・更新・削除。画面には先に反映し(楽観的)、失敗したら元に戻して、エラーを投げる(メモと同じ)
export function useProductCommentActions(productId: string) {
  const client = useQueryClient()
  const key = productCommentsQueryKey(productId)
  const add = async (comment: NewProductComment) => {
    const created = await createProductComment(productId, comment)
    client.setQueryData<ProductComment[]>(key, (comments) => [...(comments ?? []), created])
    return created
  }
  const update = async (commentId: number, patch: ProductCommentPatch) => {
    const current = client.getQueryData<ProductComment[]>(key)
    if (current) client.setQueryData<ProductComment[]>(key, current.map((c) => c.commentId === commentId ? { ...c, ...patch } : c))
    try {
      const comment = await updateProductComment(productId, commentId, patch)
      client.setQueryData<ProductComment[]>(key, (comments) => comments?.map((c) => c.commentId === commentId ? comment : c))
    } catch (error) {
      if (current) client.setQueryData(key, current)
      throw error
    }
  }
  const remove = async (commentId: number) => {
    const current = client.getQueryData<ProductComment[]>(key)
    if (current) client.setQueryData<ProductComment[]>(key, current.filter((c) => c.commentId !== commentId))
    try { await deleteProductComment(productId, commentId) }
    catch (error) { if (current) client.setQueryData(key, current); throw error }
  }
  return { add, update, remove }
}
