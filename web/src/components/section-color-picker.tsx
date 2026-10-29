import type { SectionColor } from '#/lib/section'
import { SECTION_COLOR_LABELS, SECTION_COLOR_ORDER } from '#/lib/section-editor-state'
import { sectionStyle } from '#/lib/section-style'

// セクションの色の選択(6 色)。見本は、`section-style.ts` の線の色(枠の破線と同じ色。塗りの 20% では薄すぎて見分けにくい)
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
          data-swatch={color}
          className={`size-7 cursor-pointer border focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink ${color === value ? 'border-line' : 'border-transparent hover:border-ink/50'}`}
          style={{ backgroundColor: sectionStyle(color).line }}
        />
      ))}
    </div>
  )
}
