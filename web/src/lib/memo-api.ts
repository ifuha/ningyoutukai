import { eden, edenData, type Json } from '#/lib/eden'

type Client = ReturnType<typeof eden>
type Route = ReturnType<Client['api']['product']>
type NotesRoute = Route['note']
type NoteRoute = ReturnType<NotesRoute['get']>
type Success<R extends { data: unknown; error: unknown }> = NonNullable<Extract<R, { error: null }>['data']>
export type ProductNote = Json<Success<Awaited<ReturnType<NotesRoute['get']>>>>[number]
export type ProductNotePatch = NonNullable<Parameters<ReturnType<NotesRoute>['patch']>[0]>

export const listProductNotes = (productId: string) => edenData(eden().api.product({ productId }).note.get())
export const createProductNote = (productId: string, x: number, y: number) => edenData(eden().api.product({ productId }).note.post({ x, y }))
export const updateProductNote = (productId: string, noteId: string, patch: ProductNotePatch) => edenData(eden().api.product({ productId }).note({ noteId }).patch(patch))
export const deleteProductNote = (productId: string, noteId: string) => edenData(eden().api.product({ productId }).note({ noteId }).delete())
