// セクションの名前(ラベル)の位置と大きさ。`SectionBox`(表示)と、編集枠(つかむ場所・名前の入力欄・削除の確認)が、同じ寸法を使う
// Figma: 名前は色つきの札ではなく、**枠の上の左に置く文字**。枠の外側の上辺から 16px 上の帯に、文字の中心がある(全体 300 × 416 のうち、上の 16px)
// 座標は、四角の**外側の左上**を原点にする(編集枠の外枠と同じ)。上辺より上は負
//
// **縮小したときも、名前を、画面上で読める大きさに保つ**(Figma のセクション名と同じ)。
//   名前は、キャンバスの変換(パン・ズームの `transform: scale`)の内側に描くので、何もしないと、画面上の大きさは `scale` に比例して小さくなる。
//   そこで、名前に関わる寸法(文字の大きさ・行の高さ・帯・左の余白・つかむ場所・入力欄・削除の確認の位置)に、**同じ係数 `factor`**(`titleFactor(scale)`)を掛ける。
//   `scale ≥ 1`(拡大・等倍)では 1(キャンバスの単位のまま。画面上は `scale` 倍に大きくなる)。
//   `scale < 1`(縮小)では `1 / scale`(キャンバスの単位で `1 / scale` 倍にして、画面上の大きさを一定にする)。`scale = 1` で連続。
// 関数の `factor` は、すべて既定が 1(係数なし=キャンバスの単位の素の寸法)。呼ぶ側は、`titleFactor(scale)` を 1 回求めて、全部に同じ値を渡す

/** 名前の帯の高さ(px)。枠の外側の上辺の、すぐ上。**`factor` を掛ける前の、キャンバスの単位** */
export const LABEL_BAND_PX = 16
/** 外側の左端から、文字の左端まで(px)。`factor` を掛ける前 */
export const LABEL_TEXT_LEFT_PX = 6
/** 枠線の太さ(px)。`SectionBox` の `border-2` と同じ。**名前の係数は掛けない**(枠は、ズームに比例して変わる) */
export const SECTION_BORDER_PX = 2
/**
 * 名前の文字の大きさと行の高さ(px)。`factor` を掛ける前の、キャンバスの単位。
 * `rem` 基準のクラス(`text-sm`)ではなく、この値を style で渡す(ブラウザの文字の大きさの設定に、左右されない)
 */
export const LABEL_FONT_PX = 14
export const LABEL_LINE_PX = LABEL_BAND_PX
/** 名前の幅の上限(px)。これより長い名前は、省略記号にする。`factor` を掛ける(縮小しても、画面上で同じ幅まで読める) */
export const LABEL_MAX_WIDTH = 160
/**
 * 名前の幅の下限(px)。**`factor` は掛けない**(キャンバスの単位のまま)。
 * 縮小して `factor` を掛けた下限にすると、狭いセクションで、名前が、セクションの幅を超えてはみ出すため。
 * (セクションの幅が下限より狭いときだけ、これまでどおり、下限の幅まで広がる)
 */
export const LABEL_MIN_WIDTH = 40
/** つかむ場所を、文字の帯より、上と下に広げる分(px)。文字(14px)だけだと、つかみにくいため。`factor` を掛ける */
const HIT_PAD_PX = 4
/**
 * 係数の上限。`scale` が `1 / 8` より小さくなると、画面上の大きさは、14px より小さくなっていく(それ以上は、拡大しない)。
 * 理由: 全体表示のあと、さらに縮小した状態(`MIN_ZOOM(0.25) × fitScale`)でも、ふつうは `scale` は `1 / 8` 前後までで、
 *   それより小さい(読めない)縮尺では、名前だけを大きくしても意味が薄い。一方、上限が無いと、`scale` が極端に小さいとき、
 *   名前の帯(キャンバスの単位で `16 × factor`)が、周りのカードやセクションの上まで広がってしまう。8 なら、帯は最大でも 128px で、周りに及ばない
 */
export const LABEL_FACTOR_MAX = 8

/**
 * 名前の寸法に掛ける係数。`scale`(キャンバスの拡大率。1 = 等倍)から求める。
 * `scale ≥ 1` で 1、`scale < 1` で `1 / scale`(上限 `LABEL_FACTOR_MAX`)。`scale = 1` で連続(飛ばない)。
 * 0・負・NaN・無限大の入力は、係数なし(1)
 */
export function titleFactor(scale: number): number {
  if (!Number.isFinite(scale) || scale <= 0) return 1
  return Math.min(LABEL_FACTOR_MAX, Math.max(1, 1 / scale))
}

/** 係数の入力を整える(0・負・NaN・無限大は 1)。内部用 */
function safeFactor(factor: number): number {
  return Number.isFinite(factor) && factor > 0 ? factor : 1
}

/**
 * 名前をつかむ場所の幅(キャンバスの単位)。セクションの幅を、下限(`LABEL_MIN_WIDTH`。係数なし)と、上限(`LABEL_MAX_WIDTH × factor`)に収める。
 * セクションの幅が下限以上なら、セクションの幅を超えない(狭いセクションで、名前がはみ出さない)
 */
export function labelWidth(sectionWidth: number, factor = 1): number {
  const w = Number.isFinite(sectionWidth) ? sectionWidth : LABEL_MIN_WIDTH
  return Math.min(LABEL_MAX_WIDTH * safeFactor(factor), Math.max(LABEL_MIN_WIDTH, w))
}

/** 名前の文字を置く四角(外側の左上が原点)。`SectionBox` の文字の位置と、同じ。幅は 0 未満にならない */
export function labelTextRect(
  sectionWidth: number,
  factor = 1,
): { left: number; top: number; width: number; height: number } {
  const k = safeFactor(factor)
  return {
    left: LABEL_TEXT_LEFT_PX * k,
    top: -LABEL_BAND_PX * k,
    width: Math.max(0, labelWidth(sectionWidth, k) - LABEL_TEXT_LEFT_PX * k),
    height: LABEL_BAND_PX * k,
  }
}

/** 名前をつかむ場所(押すと選択、ドラッグで移動、ダブルクリックで名前の編集)と、名前の入力欄の四角。文字の帯を、上下に少し広げる */
export function labelHitRect(
  sectionWidth: number,
  factor = 1,
): { left: number; top: number; width: number; height: number } {
  const k = safeFactor(factor)
  return {
    left: 0,
    top: -LABEL_BAND_PX * k - HIT_PAD_PX * k,
    width: labelWidth(sectionWidth, k),
    height: LABEL_BAND_PX * k + HIT_PAD_PX * k * 2,
  }
}

/** 削除の確認の表示の位置(名前をつかむ場所の、すぐ下の左端。四角の外側の左上が原点) */
export function confirmPanelOffset(sectionWidth: number, factor = 1): { left: number; top: number } {
  const hit = labelHitRect(sectionWidth, factor)
  return { left: hit.left, top: hit.top + hit.height }
}

/** 名前の文字の大きさ・行の高さ・左右の余白(キャンバスの単位の px)。`SectionBox` の文字と、名前の入力欄が、同じ値を使う */
export function labelTypography(factor = 1): { fontSize: number; lineHeight: string } {
  const k = safeFactor(factor)
  return { fontSize: LABEL_FONT_PX * k, lineHeight: `${LABEL_LINE_PX * k}px` }
}

/** 名前の入力欄の左右の余白(キャンバスの単位の px)。文字の左端の余白と同じ */
export function labelInputPadding(factor = 1): number {
  return LABEL_TEXT_LEFT_PX * safeFactor(factor)
}

/**
 * 名前の文字の、画面上の大きさ(px)。キャンバスの単位の大きさ(`factor` つき)に、拡大率を掛けた値。
 * `scale ≥ 1` で `14 × scale`(拡大に比例)、`1 / 8 ≤ scale < 1` で 14(一定)、それより小さいと `14 × 8 × scale`
 */
export function labelScreenFontPx(scale: number): number {
  const s = Number.isFinite(scale) && scale > 0 ? scale : 1
  return LABEL_FONT_PX * titleFactor(s) * s
}
