import { SECTION_BORDER_PX, labelTextRect, labelTypography, titleFactor } from '#/lib/section-label'
import { sectionStyle } from '#/lib/section-style'
import type { Section } from '#/lib/section'

// セクションの四角(カードの後ろに敷く)。Figma: 破線の枠(その色)と、同じ色の 20% の塗り。名前は、色つきの札ではなく、枠の上の左に置く文字
// 位置と大きさは、キャンバスの座標(`x`・`y`・`width`・`height`)。`offsetX` / `offsetY` は、負の座標があるときの全体のずらし量
// 名前: 外側の左端から 6px、外側の上辺から 16px 上の帯(`section-label.ts`。編集枠のつかむ場所・名前の入力欄と同じ寸法)
//   絶対配置の基準は枠線の内側なので、枠線 2px の分だけ戻す(左 6 - 2、上 -16 - 2)
//   名前の大きさ(14px、行の高さ 16px)は、**キャンバスの単位**に、係数 `titleFactor(scale)` を掛けたもの。
//   この部品は、キャンバスの変換(パン・ズーム)の内側に置かれるので、画面上の大きさは `scale` 倍になる。
//   **縮小したとき(`scale < 1`)は、係数 `1 / scale` を掛けて、画面上の大きさを 14px に保つ**(読めなくならない。Figma と同じ)。
//   拡大・等倍(`scale ≥ 1`)は、係数 1(拡大に比例して大きくなる)。枠線の太さは、係数を掛けない(ズームに比例して変わる)
// 色は、`section-style.ts` の線の色(1 か所)から作る。Tailwind のクラスではなく、style で渡す(色の値を差し替えるだけで直るように)
// ポインタを通す(ドラッグはキャンバスの移動になる)。選択・移動・大きさの変更は、編集枠(第 2 段階)が受ける
// `selected`: 選択中の見た目(外側の輪郭)。`highlighted`: カードのドロップ先になっている見た目(輪を足し、塗りを 35% に濃くする)
// `scale`: キャンバスの拡大率(1 = 等倍)。名前の係数を求める。省略すると 1(係数なし)
export function SectionBox({
  section,
  offsetX = 0,
  offsetY = 0,
  selected = false,
  highlighted = false,
  scale = 1,
}: {
  section: Section
  offsetX?: number
  offsetY?: number
  selected?: boolean
  highlighted?: boolean
  scale?: number
}) {
  const style = sectionStyle(section.color)
  const factor = titleFactor(scale)
  const label = labelTextRect(section.width, factor)
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
        className="absolute truncate text-ink"
        style={{
          // 絶対配置の基準は枠線の内側。`label.left` / `label.top` は外側の左上が原点なので、枠線の分だけ戻す(枠線は係数を掛けない)
          left: label.left - SECTION_BORDER_PX,
          top: label.top - SECTION_BORDER_PX,
          width: label.width,
          height: label.height,
          ...labelTypography(factor),
        }}
      >
        {section.sectionName}
      </span>
    </div>
  )
}
