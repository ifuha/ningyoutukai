import { eden, edenData, type Json } from '#/lib/eden'

type Client = ReturnType<typeof eden>
type Route = ReturnType<Client['api']['product']>
type NotesRoute = Route['note']
type Success<R extends { data: unknown; error: unknown }> = NonNullable<Extract<R, { error: null }>['data']>
// 作成者(`createdBy` / `authorName`)と公開の状態(`isPublic`)は、API がまだ返さない(別の PR で対応)。それまで型エラーにならないよう、eden の型に足している
// API の対応後に、eden の型だけにする(この足した型と、`updateProductNote` のキャストを消す)
export type ProductNote = Json<Success<Awaited<ReturnType<NotesRoute['get']>>>>[number] & {
  authorName?: string | null
  createdBy?: string | null
  isPublic?: boolean
}
export type ProductNotePatch = NonNullable<Parameters<ReturnType<NotesRoute>['patch']>[0]> & { isPublic?: boolean }

export const listProductNotes = (productId: string) => edenData(eden().api.product({ productId }).note.get())
export const createProductNote = (productId: string, x: number, y: number) => edenData(eden().api.product({ productId }).note.post({ x, y }))
export const updateProductNote = (productId: string, noteId: string, patch: ProductNotePatch) => edenData(eden().api.product({ productId }).note({ noteId }).patch(patch as Parameters<ReturnType<NotesRoute>['patch']>[0]))
// ↑ eden の PATCH の型は、まだ isPublic を知らない。API の対応後に、キャストを消す
export const deleteProductNote = (productId: string, noteId: string) => edenData(eden().api.product({ productId }).note({ noteId }).delete())
