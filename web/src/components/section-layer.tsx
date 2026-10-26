import { SectionBox } from '#/components/section-box'
import type { Section } from '#/lib/section'

/**
 * セクションの四角を、カードの後ろに敷く層(F1 セクション画面)。
 * `selectedSectionId`: 選択中のセクション(輪郭)。`hoverSectionId`: カードをドラッグしていて、ドロップ先になっているセクション(強調)。
 * `offsetX` / `offsetY`: 負の座標があるときの、全体のずらし量。
 */
export function SectionLayer({
  sections,
  selectedSectionId,
  hoverSectionId,
  offsetX = 0,
  offsetY = 0,
}: {
  sections: Section[]
  selectedSectionId: string | null
  hoverSectionId: string | null
  offsetX?: number
  offsetY?: number
}) {
  return (
    <>
      {sections.map((s) => (
        <SectionBox
          key={s.sectionId}
          section={s}
          offsetX={offsetX}
          offsetY={offsetY}
          selected={s.sectionId === selectedSectionId}
          highlighted={s.sectionId === hoverSectionId}
        />
      ))}
    </>
  )
}
