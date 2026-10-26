import type { SectionColor } from '#/lib/section'
import { SECTION_COLOR_LABELS, SECTION_COLOR_ORDER } from '#/lib/section-editor-state'
import { sectionStyle } from '#/lib/section-style'

// セクションの色の選択(6 色)。色の見た目は `section-style.ts` の札の色(塗り)をそのまま使う
// いまの色は、枠で示す(`aria-pressed`)。色の名前は、スクリーンリーダー用(`aria-label`)とツールチップ
export function SectionColorPicker({
  value,
  onPick,
}: {
  value: SectionColor
  onPick: (color: SectionColor) => void
}) {
  return (
    <div role="group" aria-label="セクションの色" className="flex gap-1.5">
      {SECTION_COLOR_ORDER.map((color) => (
        <button
          key={color}
          type="button"
          aria-label={SECTION_COLOR_LABELS[color]}
          aria-pressed={color === value}
          title={SECTION_COLOR_LABELS[color]}
          onClick={() => onPick(color)}
          className={`size-7 cursor-pointer border-2 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink ${sectionStyle(color).tag} ${color === value ? 'border-ink' : 'border-transparent hover:border-ink/50'}`}
        />
      ))}
    </div>
  )
}
