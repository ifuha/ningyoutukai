import type { eden, Json } from '#/lib/eden'

type TreeResult = Awaited<
  ReturnType<ReturnType<ReturnType<typeof eden>['api']['product']>['tree']['get']>
>

type RawTree = Json<NonNullable<Extract<TreeResult, { error: null }>['data']>>

/**
 * `GET /api/product/:productId/tree` の応答。型は api の応答から取る。
 * api の型では `leader` は null になりうるが、画面はリーダーがいる前提なので、非 null にする
 * (null の場合は、取得するところ(`products.$productId.tsx`)でエラーにする)。
 */
export type ProductTree = Omit<RawTree, 'leader'> & {
  leader: NonNullable<RawTree['leader']>
}

/** ツリーの 1 人分(リーダーかメンバー)。`tasks` は期限が近い順 */
export type TreeMember = ProductTree['leader']

/** ツリーのタスク 1 件 */
export type TreeTask = TreeMember['tasks'][number]
