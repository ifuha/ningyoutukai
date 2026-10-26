import { LABEL_BAND_PX, LABEL_TEXT_LEFT_PX, SECTION_BORDER_PX, labelTextRect } from '#/lib/section-label'
import { sectionStyle } from '#/lib/section-style'
import type { Section } from '#/lib/section'

// セクションの四角(カードの後ろに敷く)。Figma: 破線の枠(その色)と、同じ色の 20% の塗り。名前は、色つきの札ではなく、枠の上の左に置く文字
// 位置と大きさは、キャンバスの座標(`x`・`y`・`width`・`height`)。`offsetX` / `offsetY` は、負の座標があるときの全体のずらし量
// 名前: 外側の左端から 6px、外側の上辺から 16px 上の帯(`section-label.ts`。編集枠のつかむ場所・名前の入力欄と同じ寸法)
//   絶対配置の基準は枠線の内側なので、枠線 2px の分だけ戻す(左 6 - 2、上 -16 - 2)
// 色は、`section-style.ts` の線の色(1 か所)から作る。Tailwind のクラスではなく、style で渡す(色の値を差し替えるだけで直るように)
// ポインタを通す(ドラッグはキャンバスの移動になる)。選択・移動・大きさの変更は、編集枠(第 2 段階)が受ける
// `selected`: 選択中の見た目(外側の輪郭)。`highlighted`: カードのドロップ先になっている見た目(輪を足し、塗りを 35% に濃くする)
export function SectionBox({
  section,
  offsetX = 0,
  offsetY = 0,
  selected = false,
  highlighted = false,
}: {
  section: Section
  offsetX?: number
  offsetY?: number
  selected?: boolean
  highlighted?: boolean
}) {
  const style = sectionStyle(section.color)
  const label = labelTextRect(section.width)
  return (
    <div
      role="group"
      aria-label={`セクション ${section.sectionName}`}
      data-section-id={section.sectionId}
      data-selected={selected || undefined}
      data-highlighted={highlighted || undefined}
      className={`pointer-events-none absolute border-2 border-dashed ${
        selected ? 'outline-2 outline-offset-4 outline-ink' : ''
      } ${highlighted ? 'ring-4 ring-ink/40' : ''}`}
      style={{
        left: section.x + offsetX,
        top: section.y + offsetY,
        width: section.width,
        height: section.height,
        borderColor: style.line,
        backgroundColor: highlighted ? style.fillStrong : style.fill,
      }}
    >
      <span
        data-section-label=""
        title={section.sectionName}
        className="absolute truncate text-sm leading-4 text-ink"
        style={{
          left: LABEL_TEXT_LEFT_PX - SECTION_BORDER_PX,
          top: -(LABEL_BAND_PX + SECTION_BORDER_PX),
          width: label.width,
          height: label.height,
        }}
      >
        {section.sectionName}
      </span>
    </div>
  )
}
