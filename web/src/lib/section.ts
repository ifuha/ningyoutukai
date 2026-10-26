import type { eden, Json } from '#/lib/eden'

type ListResult = Awaited<
  ReturnType<
    ReturnType<ReturnType<typeof eden>['api']['product']>['section']['get']
  >
>

/**
 * `GET /api/product/:productId/section`(そのプロダクトのセクションの一覧)の 1 件。型は api の応答から取る。
 * `x`・`y`・`width`・`height` はキャンバスの座標(自動配置の左上が原点)、`memberIds` は所属するメンバー
 */
export type Section = Json<
  NonNullable<Extract<ListResult, { error: null }>['data']>
>[number]

/** セクションの色(api の `sectionColors` と同じ 6 色) */
export type SectionColor = Section['color']
