// セクションの作成・大きさの変更・削除・メンバーの移動(カードの位置の変更と、セクションへの出し入れ)は、リーダーのみ。
// メンバーは、自分のカードも動かせない(決定済み。api も、リーダー以外は 403)。
// 画面でも、リーダーでなければ、編集の入り口を出さない(api が最後の砦)。

/** プロダクトでの自分の役割(`GET /api/product/:productId` の `role`)から、セクションを編集できるか */
export function canEditSections(role: string | null | undefined): boolean {
  return role === 'leader'
}
