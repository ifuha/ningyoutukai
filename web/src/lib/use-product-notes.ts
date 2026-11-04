import { useQuery, useQueryClient } from '@tanstack/react-query'
import { createProductNote, deleteProductNote, listProductNotes, updateProductNote } from '#/lib/memo-api'
import type { ProductNote, ProductNotePatch } from '#/lib/memo-api'
import { fetchUnlessCommitted } from '#/lib/pending-commits'
import { retryDelay, retryTransient } from '#/lib/query-retry'

export const productNotesQueryKey = (productId: string) => ['products', productId, 'notes'] as const
export function useProductNotes(productId: string) {
  const client = useQueryClient()
  return useQuery({ queryKey: productNotesQueryKey(productId), queryFn: () => fetchUnlessCommitted(() => listProductNotes(productId), () => client.getQueryData(productNotesQueryKey(productId))), retry: retryTransient, retryDelay })
}

export function useProductNoteActions(productId: string) {
  const client = useQueryClient()
  const key = productNotesQueryKey(productId)
  const add = async (x: number, y: number) => {
    const note = await createProductNote(productId, x, y)
    client.setQueryData<ProductNote[]>(key, (notes) => [...(notes ?? []), note])
    return note
  }
  const update = async (noteId: string, patch: ProductNotePatch) => {
    const current = client.getQueryData<ProductNote[]>(key)
    if (current) client.setQueryData<ProductNote[]>(key, current.map((n) => n.noteId === noteId ? { ...n, ...patch } : n))
    try {
      const note = await updateProductNote(productId, noteId, patch)
      client.setQueryData<ProductNote[]>(key, (notes) => notes?.map((n) => n.noteId === noteId ? note : n))
    } catch (error) {
      if (current) client.setQueryData(key, current)
      throw error
    }
  }
  const remove = async (noteId: string) => {
    const current = client.getQueryData<ProductNote[]>(key)
    if (current) client.setQueryData<ProductNote[]>(key, current.filter((n) => n.noteId !== noteId))
    try { await deleteProductNote(productId, noteId) }
    catch (error) { if (current) client.setQueryData(key, current); throw error }
  }
  return { add, update, remove }
}
