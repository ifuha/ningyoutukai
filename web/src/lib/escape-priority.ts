import type { CanvasTool } from '#/lib/section-interaction-types'

// Esc の優先順位。1 回の Esc で、いちばん優先順位が高い 1 つだけが受ける(ほかは、何もしない)。
// 描く層(A)、カードのドラッグ(C)、編集枠(B: ドラッグ・矢印キーの移動・メニュー・名前の入力)、選択の解除(土台 T1)は、それぞれ
// 自分の Esc を持つので、「いま、誰が受けるか」を 1 か所で決める。受けたもの以外は、動かさない。
//   1. 描いている(道具が「セクション」)→ 描く層 / 道具が「選択」に戻る
//   2. カードをドラッグ中 → ドラッグの取り消し
//   3. 編集枠のドラッグ・矢印キーの移動の途中 → その取り消し
//   4. 名前を入力中 → 入力の取り消し
//   5. 編集のメニューが開いている → メニューを閉じる
//   6. セクションを選択中 → 選択の解除
// 土台(T1)が自分で動くのは、1 と 6 だけ(2〜5 は、それぞれの部品が受ける)。

export type EscapeOwner =
  | 'draw'
  | 'card-drag'
  | 'editor-drag'
  | 'typing'
  | 'menu'
  | 'selection'
  | 'none'

export function escapeOwner({
  tool,
  selectedSectionId,
  typing,
  cardDragging,
  editorDragging,
  menuOpen,
}: {
  tool: CanvasTool
  selectedSectionId: string | null
  /** キーの入力先が、文字を打つ要素か(名前の変更など) */
  typing: boolean
  /** カードをドラッグしている最中か */
  cardDragging: boolean
  /** 編集枠のドラッグ・矢印キーの移動の途中か */
  editorDragging: boolean
  /** 編集のメニュー(色・削除の確認)が開いているか */
  menuOpen: boolean
}): EscapeOwner {
  if (tool === 'section') return 'draw'
  if (cardDragging) return 'card-drag'
  if (editorDragging) return 'editor-drag'
  if (typing) return 'typing'
  if (menuOpen) return 'menu'
  if (selectedSectionId !== null) return 'selection'
  return 'none'
}

/** 土台(T1)が、自分で動く Esc か(道具を戻す・選択を外す)。それ以外は、ほかの部品が受ける */
export function isOwnedByFoundation(owner: EscapeOwner): boolean {
  return owner === 'draw' || owner === 'selection'
}
