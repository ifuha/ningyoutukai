import { eden, edenData, type Json } from '#/lib/eden'

type Client = ReturnType<typeof eden>
type Route = ReturnType<Client['api']['product']>
type Success<R extends { data: unknown; error: unknown }> = NonNullable<Extract<R, { error: null }>['data']>
// コメント: リーダーが画面(ツリー)の座標に置く。見られるのは参加者全員。`canEdit` は、見ている人がリーダーか(API が決める)
export type ProductComment = Json<Success<Awaited<ReturnType<Route['comment']['get']>>>>[number]
export type ProductCommentPatch = NonNullable<Parameters<ReturnType<Route['comment']>['patch']>[0]>
export type NewProductComment = { content: string; x: number; y: number }

export const listProductComments = (productId: string) => edenData(eden().api.product({ productId }).comment.get())
export const createProductComment = (productId: string, comment: NewProductComment) => edenData(eden().api.product({ productId }).comment.post(comment))
export const updateProductComment = (productId: string, commentId: number, patch: ProductCommentPatch) => edenData(eden().api.product({ productId }).comment({ commentId }).patch(patch))
export const deleteProductComment = (productId: string, commentId: number) => edenData(eden().api.product({ productId }).comment({ commentId }).delete())
