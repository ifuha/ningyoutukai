import { Ellipsis } from 'lucide-react'
import { SectionColorPicker } from '#/components/section-color-picker'
import type { SectionColor } from '#/lib/section'
import { MENU_BUTTON_OFFSET, inverseScaleStyle, type MenuState } from '#/lib/section-editor-state'

// 選択中のセクションの、札のとなりの小さなメニュー(「⋯」)。色の変更と、削除(確認を挟む)
// 状態(`MenuState`)は、キーボードの Delete からも確認を開くので、親(`SectionEditor`)が持つ
// キャンバスの拡大率を打ち消して、拡大率に関わらず読める大きさにする(左上を基準に 1 / scale)
const buttonClass =
  'cursor-pointer border-2 border-ink px-2 py-1 hover:bg-side-item focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink'

export function SectionEditorMenu({
  name,
  color,
  menu,
  scale,
  onToggle,
  onPickColor,
  onAskDelete,
  onCancelDelete,
  onConfirmDelete,
}: {
  name: string
  color: SectionColor
  menu: MenuState
  scale: number
  onToggle: () => void
  onPickColor: (color: SectionColor) => void
  onAskDelete: () => void
  onCancelDelete: () => void
  onConfirmDelete: () => void
}) {
  return (
    <div
      data-section-menu
      // メニューの中の操作で、キャンバスの移動などが始まらないようにする
      onPointerDown={(e) => e.stopPropagation()}
      className="pointer-events-auto absolute z-40"
      style={{ left: MENU_BUTTON_OFFSET.left, top: MENU_BUTTON_OFFSET.top, ...inverseScaleStyle(scale) }}
    >
      <button
        type="button"
        aria-label="セクションのメニュー"
        aria-haspopup="menu"
        aria-expanded={menu !== 'closed'}
        onClick={onToggle}
        className="flex size-8 cursor-pointer items-center justify-center border-2 border-ink bg-surface text-ink hover:bg-side-item focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink"
      >
        <Ellipsis aria-hidden="true" size={18} />
      </button>
      {menu !== 'closed' && (
        <div
          role={menu === 'confirm-delete' ? 'alertdialog' : 'menu'}
          aria-label={menu === 'confirm-delete' ? 'セクションの削除の確認' : 'セクションのメニュー'}
          className="absolute top-9 left-0 w-60 space-y-2 border-2 border-ink bg-surface p-2 text-sm text-ink"
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
      )}
    </div>
  )
}
