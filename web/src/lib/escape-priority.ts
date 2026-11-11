import type { CanvasTool } from '#/lib/section-interaction-types'

// Esc の優先順位。1 回の Esc で、いちばん優先順位が高い 1 つだけが受ける(ほかは、何もしない)。
// 描く層(A)、カードのドラッグ(C)、範囲選択、編集枠(B: ドラッグ・矢印キーの移動・メニュー・名前の入力)、選択の解除(土台 T1)は、それぞれ
// 自分の Esc を持つので、「いま、誰が受けるか」を 1 か所で決める。受けたもの以外は、動かさない。
//   1. 描いている(道具が「セクション」)→ 描く層 / 道具が「選択」に戻る
//   2. カードをドラッグ中 → ドラッグの取り消し
//   3. 範囲選択の最中 → 選択の取り消し
//   4. 編集枠のドラッグ・矢印キーの移動の途中 → その取り消し
//   5. 名前を入力中 → 入力の取り消し
//   6. 編集のメニューが開いている → メニューを閉じる
//   7. 何かを選択中 → 選択の解除
// 土台(T1)が自分で動くのは、1 と 7 だけ(2〜6 は、それぞれの部品が受ける)。

export type EscapeOwner =
  | 'draw'
  | 'card-drag'
  | 'marquee'
  | 'editor-drag'
  | 'typing'
  | 'menu'
  | 'selection'
  | 'none'

export function escapeOwner({
  tool,
  selectedSectionId = null,
  hasSelection,
  typing,
  cardDragging,
  marqueeDragging = false,
  editorDragging,
  menuOpen,
}: {
  tool: CanvasTool
  /** 選択中のセクション(1 つだけのとき)。`hasSelection` を渡さないときの、後方互換のために残す */
  selectedSectionId?: string | null
  /** 何か(カード・セクション・メモ)を選択中か。省略すると、`selectedSectionId` から決める */
  hasSelection?: boolean
  /** キーの入力先が、文字を打つ要素か(名前の変更など) */
  typing: boolean
  /** カードをドラッグしている最中か */
  cardDragging: boolean
  /** 範囲選択の最中か */
  marqueeDragging?: boolean
  /** 編集枠のドラッグ・矢印キーの移動の途中か */
  editorDragging: boolean
  /** 編集のメニュー(色・削除の確認)が開いているか */
  menuOpen: boolean
}): EscapeOwner {
  if (tool === 'section') return 'draw'
  if (cardDragging) return 'card-drag'
  if (marqueeDragging) return 'marquee'
  if (editorDragging) return 'editor-drag'
  if (typing) return 'typing'
  if (menuOpen) return 'menu'
  if (hasSelection ?? selectedSectionId !== null) return 'selection'
  return 'none'
}

/** 土台(T1)が、自分で動く Esc か(道具を戻す・選択を外す)。それ以外は、ほかの部品が受ける */
export function isOwnedByFoundation(owner: EscapeOwner): boolean {
  return owner === 'draw' || owner === 'selection'
}
