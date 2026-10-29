import type { CanvasTool } from '#/lib/section-interaction-types'

// 道具(モード)の状態の遷移。画面に依存しない関数にして、テストする。
// 「選択」「セクション」の 2 つ。「セクション」はリーダーだけが使える。
// 「メモ」「検索」は道具ではない(押せない)。

/** その道具が使えるか。「セクション」はリーダーだけ */
export function isToolEnabled(tool: CanvasTool, canEditSections: boolean): boolean {
  return tool !== 'section' || canEditSections
}

/** 使えない道具(リーダーでなくなったとき、など)は、「選択」に戻す */
export function normalizeTool(tool: CanvasTool, canEditSections: boolean): CanvasTool {
  return isToolEnabled(tool, canEditSections) ? tool : 'select'
}

/** セクションを置いたあとの道具。Figma と同じく、置いたら「選択」に戻る */
export function toolAfterCreate(): CanvasTool {
  return 'select'
}

export type EscapeAction = 'back-to-select' | 'clear-selection' | 'none'

/**
 * Esc を押したときの動き。
 * - 入力欄に文字を打っているとき(名前の変更など)は、何もしない(その入力欄が受ける)
 * - 「セクション」の道具のときは、「選択」に戻る
 * - セクションを選択しているときは、選択を解除する
 */
export function escapeAction({
  tool,
  selectedSectionId,
  typing,
}: {
  tool: CanvasTool
  selectedSectionId: string | null
  typing: boolean
}): EscapeAction {
  if (typing) return 'none'
  if (tool === 'section') return 'back-to-select'
  if (selectedSectionId !== null) return 'clear-selection'
  return 'none'
}

/** キーの入力先が、文字を打つ要素か(入力欄、テキストエリア、選択欄、編集できる要素) */
export function isTypingTarget(
  target: { tagName?: string; isContentEditable?: boolean } | null,
): boolean {
  if (!target) return false
  if (target.isContentEditable) return true
  const tag = target.tagName?.toLowerCase()
  return tag === 'input' || tag === 'textarea' || tag === 'select'
}

/**
 * キャンバスのカーソル(Tailwind のクラス名。完全な文字列で書く)。
 * 「選択」は通常の矢印(ドラッグ中も)、「セクション」は十字
 */
export function cursorClass(tool: CanvasTool): string {
  switch (tool) {
    case 'section':
      return 'cursor-crosshair'
    case 'select':
      return 'cursor-default'
  }
}
