import { edenData, eden } from '#/lib/eden'

// ツリーの AI のカードの位置(リーダーだけ)。位置は、初めの置き場所(リーダーは右、メンバーは下)からのずれ(px)

export const setAiPosition = (productId: string, tokenId: string, offset: { offsetX: number; offsetY: number }) =>
  edenData(eden().api.product({ productId }).ai({ tokenId }).position.put(offset))

/** 初めの置き場所に戻す */
export const resetAiPosition = (productId: string, tokenId: string) =>
  edenData(eden().api.product({ productId }).ai({ tokenId }).position.delete())
