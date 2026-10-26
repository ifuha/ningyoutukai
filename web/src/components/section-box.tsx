import { sectionStyle } from '#/lib/section-style'
import type { Section } from '#/lib/section'

// セクションの四角(カードの後ろに敷く)。薄い塗りと、同じ色の枠。左上に、色の札(セクション名)
// 位置と大きさは、キャンバスの座標(`x`・`y`・`width`・`height`)。`offsetX` / `offsetY` は、負の座標があるときの全体のずらし量
// 札の寸法(Figma の `Frame 71`): 120 × 32。四角の外側の左端から 18px 右、上の辺から 16px 上
//   絶対配置の基準は枠線の内側なので、枠線 2px の分だけ戻す(左 16、上 -18)
// 第 1 段階(表示のみ): ポインタを通す(ドラッグはキャンバスの移動になる)。選択・移動・大きさの変更は、第 2 段階
export function SectionBox({
  section,
  offsetX = 0,
  offsetY = 0,
}: {
  section: Section
  offsetX?: number
  offsetY?: number
}) {
  const style = sectionStyle(section.color)
  return (
    <div
      role="group"
      aria-label={`セクション ${section.sectionName}`}
      data-section-id={section.sectionId}
      className={`pointer-events-none absolute border-2 ${style.box}`}
      style={{
        left: section.x + offsetX,
        top: section.y + offsetY,
        width: section.width,
        height: section.height,
      }}
    >
      <span
        title={section.sectionName}
        className={`absolute top-[-18px] left-[16px] flex h-8 w-[120px] items-center px-2 text-sm font-bold ${style.tag}`}
      >
        <span className="truncate">{section.sectionName}</span>
      </span>
    </div>
  )
}
