import { SectionColorPicker } from '#/components/section-color-picker'
import type { SectionColor } from '#/lib/section'
import { inverseScaleStyle, type MenuState } from '#/lib/section-editor-state'

// 選択中のセクションの、削除の確認の表示(と、色の選択のメニュー)
// 「⋯」のボタンは、ユーザーの指示で**消した**。そのため、いま、この部品が出るのは、**キーボード(選択中の Delete / Backspace)で開く、削除の確認**だけ
// 色の選択のメニュー(`menu === 'menu'`。色の選択と、削除のボタン)は、**開く入口が、いまは無い**(使われていない)。
// 後で、別の入口(右クリック、名前の近くのボタン、など)をつけるために、部品と、色を渡す呼び出し(`onPickColor` → `onColorChange`)は、残してある
// 状態(`MenuState`)は、キーボードの Delete からも確認を開くので、親(`SectionEditor`)が持つ
// 位置(`offset`)は、名前をつかむ場所のすぐ下の左端(`section-label.ts` の `confirmPanelOffset`)
// キャンバスの拡大率を打ち消して、拡大率に関わらず読める大きさにする(左上を基準に 1 / scale)
const buttonClass =
  'cursor-pointer border border-line px-2 py-1 hover:bg-side-item focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink'

export function SectionEditorMenu({
  name,
  color,
  menu,
  scale,
  offset,
  onPickColor,
  onAskDelete,
  onCancelDelete,
  onConfirmDelete,
}: {
  name: string
  color: SectionColor
  menu: MenuState
  scale: number
  /** 表示の位置(四角の外側の左上が原点) */
  offset: { left: number; top: number }
  /** 色を選んだとき(いまは、このメニューを開く入口が無いので、呼ばれない) */
  onPickColor: (color: SectionColor) => void
  onAskDelete: () => void
  onCancelDelete: () => void
  onConfirmDelete: () => void
}) {
  // 閉じているときは、何も出さない(ボタンは無い)
  if (menu === 'closed') return null
  return (
    <div
      data-section-menu
      // メニューの中の操作で、キャンバスの移動などが始まらないようにする
      onPointerDown={(e) => e.stopPropagation()}
      className="pointer-events-auto absolute z-40"
      style={{ left: offset.left, top: offset.top, ...inverseScaleStyle(scale) }}
    >
      <div
        role={menu === 'confirm-delete' ? 'alertdialog' : 'menu'}
        aria-label={menu === 'confirm-delete' ? 'セクションの削除の確認' : 'セクションのメニュー'}
        className="absolute top-0 left-0 w-60 space-y-2 border border-line bg-surface p-2 text-m text-ink"
      >
        {menu === 'confirm-delete' ? (
          <>
            <p className="break-words">
              「{name}」を削除しますか? 中のメンバーは無所属に戻ります
            </p>
            <div className="flex gap-2">
              <button type="button" onClick={onConfirmDelete} className={buttonClass}>
                削除する
              </button>
              <button type="button" onClick={onCancelDelete} className={buttonClass}>
                やめる
              </button>
            </div>
          </>
        ) : (
          <>
            <SectionColorPicker value={color} onPick={onPickColor} />
            <button type="button" onClick={onAskDelete} className={buttonClass}>
              削除
            </button>
          </>
        )}
      </div>
    </div>
  )
}
