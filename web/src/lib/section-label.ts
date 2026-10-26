// セクションの名前(ラベル)の位置と大きさ。`SectionBox`(表示)と、編集枠(つかむ場所・名前の入力欄・削除の確認)が、同じ寸法を使う
// Figma: 名前は色つきの札ではなく、**枠の上の左に置く文字**。枠の外側の上辺から 16px 上の帯に、文字の中心がある(全体 300 × 416 のうち、上の 16px)
// 座標は、四角の**外側の左上**を原点にする(編集枠の外枠と同じ)。上辺より上は負

/** 名前の帯の高さ(px)。枠の外側の上辺の、すぐ上 */
export const LABEL_BAND_PX = 16
/** 外側の左端から、文字の左端まで(px) */
export const LABEL_TEXT_LEFT_PX = 6
/** 枠線の太さ(px)。`SectionBox` の `border-2` と同じ */
export const SECTION_BORDER_PX = 2
/**
 * 名前の文字の大きさと行の高さ(px)。**キャンバスの単位**(拡大率を掛ける前の大きさ)。
 * 名前は、キャンバスの変換(パン・ズームの `transform: scale`)の内側に描くので、**画面上の大きさは、拡大率に比例して変わる**
 * (拡大すると大きく、縮小すると小さく。Figma と同じ)。拡大率を打ち消す(`1 / scale`)ことは、名前では、しない(ハンドル・帯・確認の表示とは違う)
 * `rem` 基準のクラス(`text-sm`)ではなく、この値を style で渡す(ブラウザの文字の大きさの設定に、左右されない)
 */
export const LABEL_FONT_PX = 14
export const LABEL_LINE_PX = LABEL_BAND_PX
/** 名前の幅の上限(px)。これより長い名前は、省略記号にする */
export const LABEL_MAX_WIDTH = 160
/** 名前の幅の下限(px) */
export const LABEL_MIN_WIDTH = 40
/** つかむ場所を、文字の帯より、上と下に広げる分(px)。文字(14px)だけだと、つかみにくいため */
const HIT_PAD_PX = 4

/** 名前(文字)の幅。セクションの幅を、上限・下限に収める(「⋯」のボタンを消したので、メニューの分の空きは要らない) */
export function labelWidth(sectionWidth: number): number {
  const w = Number.isFinite(sectionWidth) ? sectionWidth : LABEL_MIN_WIDTH
  return Math.min(LABEL_MAX_WIDTH, Math.max(LABEL_MIN_WIDTH, w))
}

/** 名前の文字を置く四角(外側の左上が原点)。`SectionBox` の文字の位置と、同じ */
export function labelTextRect(sectionWidth: number): { left: number; top: number; width: number; height: number } {
  return {
    left: LABEL_TEXT_LEFT_PX,
    top: -LABEL_BAND_PX,
    width: labelWidth(sectionWidth) - LABEL_TEXT_LEFT_PX,
    height: LABEL_BAND_PX,
  }
}

/** 名前をつかむ場所(押すと選択、ドラッグで移動、ダブルクリックで名前の編集)と、名前の入力欄の四角。文字の帯を、上下に少し広げる */
export function labelHitRect(sectionWidth: number): { left: number; top: number; width: number; height: number } {
  return {
    left: 0,
    top: -LABEL_BAND_PX - HIT_PAD_PX,
    width: labelWidth(sectionWidth),
    height: LABEL_BAND_PX + HIT_PAD_PX * 2,
  }
}

/** 削除の確認の表示の位置(名前をつかむ場所の、すぐ下の左端。四角の外側の左上が原点) */
export function confirmPanelOffset(sectionWidth: number): { left: number; top: number } {
  const hit = labelHitRect(sectionWidth)
  return { left: hit.left, top: hit.top + hit.height }
}

/** 名前の文字の大きさ・行の高さ(キャンバスの単位の px)。`SectionBox` の文字と、名前の入力欄が、同じ値を使う */
export function labelTypography(): { fontSize: number; lineHeight: string } {
  return { fontSize: LABEL_FONT_PX, lineHeight: `${LABEL_LINE_PX}px` }
}

/** 名前の文字の、画面上の大きさ(px)。キャンバスの単位の大きさに、拡大率を掛けた値(拡大率に比例する) */
export function labelScreenFontPx(scale: number): number {
  return LABEL_FONT_PX * (Number.isFinite(scale) && scale > 0 ? scale : 1)
}
