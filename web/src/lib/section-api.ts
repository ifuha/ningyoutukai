import { ApiError } from '#/lib/api'
import { eden, edenData, type Json } from '#/lib/eden'

/**
 * セクション機能(F1)の API を呼ぶ層。型は api の応答・本文の型から取る(手書きしない)。
 * 失敗は、ほかの呼び出しと同じく `ApiError`(`message` は画面に出せる文、`status` は HTTP の状態)を投げる。
 * 画面が失敗の種類で分岐したいときは、`sectionApiErrorKind` で分類する。
 *
 * 最後の引数 `client` は、テストで偽の `fetch` を差した Eden クライアントを渡すためのもの(通常は省略する)。
 */

type Client = ReturnType<typeof eden>
type ProductRoute = ReturnType<Client['api']['product']>
type SectionsRoute = ProductRoute['section']
type SectionRoute = ReturnType<SectionsRoute>
type MemberRoute = ReturnType<ProductRoute['member']>

type Success<R extends { data: unknown; error: unknown }> = NonNullable<
  Extract<R, { error: null }>['data']
>

/** `GET .../section` の応答 */
export type SectionApiList = Json<Success<Awaited<ReturnType<SectionsRoute['get']>>>>
/** セクション 1 件(一覧・作成・更新で共通の形)。`createdAt` は ISO 文字列、`memberIds` は所属する productMemberId */
export type SectionApiSection = SectionApiList[number]
/** セクションの色(api の `sectionColors`) */
export type SectionApiColor = SectionApiSection['color']

/** `POST .../section` の本文。`x` `y` `width` `height` は省略すると api の既定(0・0・300・400) */
export type SectionApiCreateInput = Parameters<SectionsRoute['post']>[0]
/** `PATCH .../section/{sectionId}` の本文。変えるキーだけを渡す(送らないキーは本文に含めない) */
export type SectionApiUpdatePatch = NonNullable<Parameters<SectionRoute['patch']>[0]>

/**
 * `PATCH .../member/{memberId}/position` の本文。`sectionId` は 3 状態:
 * キーなし(または `undefined`)= 所属を変えない、`null` = 無所属にする、uuid = そのセクションへ入れる
 */
export type SectionApiMoveInput = NonNullable<Parameters<MemberRoute['position']['patch']>[0]>
/** カードの移動の応答 */
export type SectionApiMoveResult = Json<
  Success<Awaited<ReturnType<MemberRoute['position']['patch']>>>
>

/** `GET /api/product/{productId}/section`(メンバーなら誰でも) */
export function listSections(productId: string, client: Client = eden()) {
  return edenData(client.api.product({ productId }).section.get())
}

/** `POST /api/product/{productId}/section`(リーダーのみ)。同じプロダクトに同じ名前があると 409 */
export function createSection(
  productId: string,
  input: SectionApiCreateInput,
  client: Client = eden(),
) {
  return edenData(client.api.product({ productId }).section.post(withoutUndefined(input)))
}

/**
 * `PATCH /api/product/{productId}/section/{sectionId}`(リーダーのみ)。
 * 位置(`x` / `y`)を変えると、api が所属メンバーのカードも同じ差分だけ動かす(大きさだけの変更では動かない)
 */
export function updateSection(
  productId: string,
  sectionId: string,
  patch: SectionApiUpdatePatch,
  client: Client = eden(),
) {
  return edenData(
    client.api.product({ productId }).section({ sectionId }).patch(withoutUndefined(patch)),
  )
}

/** `DELETE /api/product/{productId}/section/{sectionId}`(リーダーのみ)。所属メンバーは無所属に戻る。本文なし(204) */
export function deleteSection(
  productId: string,
  sectionId: string,
  client: Client = eden(),
) {
  return edenData(client.api.product({ productId }).section({ sectionId }).delete())
}

/**
 * `PATCH /api/product/{productId}/member/{memberId}/position`(リーダーのみ)。カードの位置と所属を変える。
 * `sectionId` の 3 状態(キーなし=変えない / null=無所属 / uuid=そのセクションへ)を、本文のキーの有無で区別する。
 * 別のプロダクトのセクション・存在しないセクションは 422
 */
export function moveMember(
  productId: string,
  memberId: string,
  input: SectionApiMoveInput,
  client: Client = eden(),
) {
  const { positionX, positionY, sectionId } = input
  // `undefined` は「キーなし」として扱う(JSON では落ちるが、ここで明示して、null との取り違えを防ぐ)
  const body: SectionApiMoveInput =
    sectionId === undefined ? { positionX, positionY } : { positionX, positionY, sectionId }
  return edenData(client.api.product({ productId }).member({ memberId }).position.patch(body))
}

/** 値が `undefined` のキーを取り除く(`null` は残す。送らないキーは、本文に含めない) */
function withoutUndefined<T extends object>(value: T): T {
  return Object.fromEntries(
    Object.entries(value).filter(([, v]) => v !== undefined),
  ) as T
}

/** 画面が分岐するための、失敗の種類 */
export type SectionApiErrorKind =
  | 'unauthorized' // 401: ログインが必要(セッション切れは、別の仕組みが受ける)
  | 'forbidden' // 403: リーダーでない
  | 'not-found' // 404: プロダクト・セクション・メンバーが無い
  | 'name-conflict' // 409: 同じ名前のセクションがある
  | 'invalid' // 422: 入力が不正(別のプロダクトのセクションを指定した場合も)
  | 'network' // 通信できなかった(status 0)
  | 'unknown'

/** `ApiError` を、失敗の種類に分類する。`ApiError` でなければ `null`(想定外の例外は、そのまま扱う) */
export function sectionApiErrorKind(error: unknown): SectionApiErrorKind | null {
  if (!(error instanceof ApiError)) return null
  switch (error.status) {
    case 0:
      return 'network'
    case 401:
      return 'unauthorized'
    case 403:
      return 'forbidden'
    case 404:
      return 'not-found'
    case 409:
      return 'name-conflict'
    case 422:
      return 'invalid'
    default:
      return 'unknown'
  }
}
