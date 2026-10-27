import type { eden, Json } from '#/lib/eden'

type ListResult = Awaited<
  ReturnType<ReturnType<typeof eden>['api']['invitation']['get']>
>

/** `GET /api/invitation`(自分宛ての保留中の招待)の 1 件。型は api の応答から取る */
export type Invitation = Json<
  NonNullable<Extract<ListResult, { error: null }>['data']>
>[number]
