import { describe, expect, test } from 'bun:test'
import {
  LABEL_BAND_PX,
  LABEL_FACTOR_MAX,
  LABEL_FONT_PX,
  LABEL_LINE_PX,
  LABEL_MAX_WIDTH,
  LABEL_MIN_WIDTH,
  LABEL_TEXT_LEFT_PX,
  confirmPanelOffset,
  labelHitRect,
  labelInputPadding,
  labelScreenFontPx,
  labelTextRect,
  labelTypography,
  labelWidth,
  titleFactor,
} from './section-label'

describe('titleFactor(名前の係数。縮小したとき、読める大きさを保つ)', () => {
  test('拡大・等倍(scale ≥ 1)は 1(キャンバスの単位のまま。画面上は scale 倍に大きくなる)', () => {
    for (const s of [1, 1.0001, 1.5, 2, 4, 100]) expect(titleFactor(s)).toBe(1)
  })
  test('縮小(scale < 1)は 1 / scale(キャンバスの単位で拡大して、画面上の大きさを保つ)', () => {
    expect(titleFactor(0.5)).toBe(2)
    expect(titleFactor(0.25)).toBe(4)
    expect(titleFactor(0.2)).toBeCloseTo(5, 10)
  })
  test('上限(LABEL_FACTOR_MAX = 8)で止まる(scale が極端に小さくても、巨大にならない)', () => {
    expect(LABEL_FACTOR_MAX).toBe(8)
    expect(titleFactor(0.125)).toBe(8)
    for (const s of [0.1, 0.05, 0.01, 1e-9]) expect(titleFactor(s)).toBe(LABEL_FACTOR_MAX)
  })
  test('scale = 1 で連続(ズームの途中で、名前の大きさが飛ばない)', () => {
    expect(titleFactor(1 - 1e-9)).toBeCloseTo(1, 6)
    expect(titleFactor(1 + 1e-9)).toBe(1)
    // 縮小の側でも、scale を少し変えたとき、係数は少ししか変わない
    for (const s of [0.9, 0.5, 0.3, 0.2, 0.13]) {
      expect(Math.abs(titleFactor(s) - titleFactor(s * 0.999))).toBeLessThan(titleFactor(s) * 0.002)
    }
  })
  test('scale が小さいほど、係数は大きい(単調。下がることがない)', () => {
    let prev = 0
    for (let s = 4; s >= 0.01; s *= 0.9) {
      const k = titleFactor(s)
      expect(k).toBeGreaterThanOrEqual(prev)
      prev = k
    }
  })
  test('0・負・NaN・無限大は、係数なし(1)', () => {
    for (const bad of [0, -1, -0.5, Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY]) {
      expect(titleFactor(bad)).toBe(1)
    }
  })
})

describe('名前の画面上の大きさ(= キャンバスの単位 × 係数 × scale)', () => {
  test('縮小時は、14px で一定(1/8 ≤ scale ≤ 1)', () => {
    for (const s of [1, 0.9, 0.75, 0.5, 0.3, 0.25, 0.2, 0.15, 0.125]) {
      expect(labelScreenFontPx(s)).toBeCloseTo(14, 10)
      // 同じ値を、実際の寸法(文字の大きさ)から求めても、同じ
      expect(labelTypography(titleFactor(s)).fontSize * s).toBeCloseTo(14, 10)
    }
  })
  test('拡大時は、scale 倍(14 × scale)に大きくなる', () => {
    expect(labelScreenFontPx(2)).toBe(28)
    expect(labelScreenFontPx(4)).toBe(56)
    expect(labelTypography(titleFactor(2)).fontSize * 2).toBe(28)
  })
  test('上限(scale < 1/8)を下回ると、画面上の大きさは、14 より小さくなっていく(拡大しきれない)', () => {
    expect(labelScreenFontPx(0.0625)).toBeCloseTo(7, 10)
    expect(labelScreenFontPx(0.05)).toBeCloseTo(5.6, 10)
  })
  test('文字は、縮小のどの段階でも、14px を下回らない(上限の範囲で)', () => {
    for (let s = 1; s >= 1 / LABEL_FACTOR_MAX - 1e-9; s *= 0.93) expect(labelScreenFontPx(s)).toBeGreaterThanOrEqual(14 - 1e-9)
  })
  test('拡大率が 0 以下・数でないときは、1 として扱う(落ちない)', () => {
    for (const bad of [0, -1, Number.NaN, Number.POSITIVE_INFINITY]) expect(labelScreenFontPx(bad)).toBe(14)
  })
})

describe('名前の寸法は、同じ係数で、すべて掛かる', () => {
  test('文字の大きさ・行の高さ・左右の余白(係数 4)', () => {
    expect(labelTypography(4)).toEqual({ fontSize: 56, lineHeight: '64px' })
    expect(labelInputPadding(4)).toBe(24)
  })
  test('係数を省略すると、1(キャンバスの単位の素の寸法)', () => {
    expect(labelTypography()).toEqual({ fontSize: 14, lineHeight: '16px' })
    expect(labelTypography()).toEqual(labelTypography(1))
    expect(labelInputPadding()).toBe(LABEL_TEXT_LEFT_PX)
    expect(labelTextRect(300)).toEqual(labelTextRect(300, 1))
    expect(labelHitRect(300)).toEqual(labelHitRect(300, 1))
    expect(confirmPanelOffset(300)).toEqual(confirmPanelOffset(300, 1))
    expect(labelWidth(300)).toBe(labelWidth(300, 1))
  })
  test('文字を置く四角: 左の余白・上(帯)・高さが、係数倍(係数 4)', () => {
    const r = labelTextRect(300, 4)
    expect(r.left).toBe(LABEL_TEXT_LEFT_PX * 4)
    expect(r.top).toBe(-LABEL_BAND_PX * 4)
    expect(r.height).toBe(LABEL_BAND_PX * 4)
    expect(r.width).toBe(300 - LABEL_TEXT_LEFT_PX * 4)
  })
  test('行の高さと帯の高さは、いつも同じ(文字が帯からはみ出さない)', () => {
    for (const k of [1, 2, 4, 8]) {
      expect(labelTextRect(300, k).height).toBe(LABEL_LINE_PX * k)
      expect(parseFloat(labelTypography(k).lineHeight)).toBe(labelTextRect(300, k).height)
    }
  })
  test('文字は、上辺より下(セクションの内側)に入らない(どの係数でも)', () => {
    for (const k of [1, 2, 4, 8]) {
      for (const w of [20, 50, 80, 300, 5000]) {
        const r = labelTextRect(w, k)
        expect(r.top + r.height).toBeLessThanOrEqual(0)
      }
    }
  })
  test('係数が 0・負・NaN のときは、1 として扱う', () => {
    for (const bad of [0, -2, Number.NaN, Number.POSITIVE_INFINITY]) {
      expect(labelTypography(bad)).toEqual(labelTypography(1))
      expect(labelHitRect(300, bad)).toEqual(labelHitRect(300, 1))
    }
  })
})

describe('labelWidth(名前の幅。上限は係数倍、下限は係数なし)', () => {
  test('係数 1: 広いセクションでは上限(160)、狭いセクションでは下限(40)', () => {
    expect(labelWidth(300)).toBe(160)
    expect(labelWidth(10_000)).toBe(LABEL_MAX_WIDTH)
    expect(labelWidth(40)).toBe(LABEL_MIN_WIDTH)
    expect(labelWidth(1)).toBe(LABEL_MIN_WIDTH)
  })
  test('係数 1: 中間は、セクションの幅そのまま', () => {
    expect(labelWidth(80)).toBe(80)
    expect(labelWidth(150)).toBe(150)
    expect(labelWidth(200)).toBe(160)
  })
  test('係数 4: 上限は 640(画面上では、縮小しても 160px まで読める)。セクションの幅を超えない', () => {
    expect(labelWidth(10_000, 4)).toBe(640)
    expect(labelWidth(300, 4)).toBe(300)
    expect(labelWidth(100, 4)).toBe(100)
  })
  test('係数 4: 下限は 40 のまま(狭いセクションで、名前が、セクションの幅を超えてはみ出さない)', () => {
    expect(labelWidth(20, 4)).toBe(LABEL_MIN_WIDTH)
    expect(labelWidth(1, 8)).toBe(LABEL_MIN_WIDTH)
  })
  test('セクションの幅が下限以上なら、名前の幅は、セクションの幅を超えない(どの係数でも)', () => {
    for (const k of [1, 2, 4, 8]) {
      for (const w of [40, 41, 80, 150, 300, 1000]) expect(labelWidth(w, k)).toBeLessThanOrEqual(Math.max(w, LABEL_MIN_WIDTH))
    }
  })
  test('文字を置く四角の幅は、0 未満にならない(係数が大きく、セクションが狭いとき)', () => {
    expect(labelTextRect(20, 8).width).toBe(0)
    expect(labelTextRect(40, 8).width).toBe(0)
    for (const w of [20, 40, 60]) expect(labelTextRect(w, 8).width).toBeGreaterThanOrEqual(0)
  })
  test('数でない値でも、落ちずに下限になる', () => {
    expect(labelWidth(Number.NaN)).toBe(LABEL_MIN_WIDTH)
    expect(labelWidth(Number.POSITIVE_INFINITY)).toBe(LABEL_MIN_WIDTH)
    expect(labelWidth(Number.NaN, 4)).toBe(LABEL_MIN_WIDTH)
  })
})

describe('つかむ場所・入力欄・削除の確認は、名前の文字と同じ寸法・同じ位置', () => {
  test('つかむ場所は、文字の帯を含み、上下に 4 × 係数 ずつ広がる(中心は帯の中心と同じ)', () => {
    for (const k of [1, 2, 4, 8]) {
      const text = labelTextRect(300, k)
      const hit = labelHitRect(300, k)
      expect(hit.left).toBeLessThanOrEqual(text.left)
      expect(hit.left + hit.width).toBeGreaterThanOrEqual(text.left + text.width)
      expect(hit.top).toBeLessThan(text.top)
      expect(hit.top + hit.height).toBeGreaterThan(text.top + text.height)
      expect(hit.top + hit.height / 2).toBeCloseTo(text.top + text.height / 2, 10)
      expect(text.top - hit.top).toBeCloseTo(4 * k, 10)
    }
  })
  test('つかむ場所の幅は、名前の幅と同じ(セクションの幅を超えない)', () => {
    for (const k of [1, 4]) for (const w of [80, 150, 300]) expect(labelHitRect(w, k).width).toBe(labelWidth(w, k))
  })
  test('画面上でも、つかむ場所の高さは、縮小しても一定(1/8 ≤ scale ≤ 1 で、24px)', () => {
    for (const s of [1, 0.5, 0.25, 0.125]) {
      expect(labelHitRect(300, titleFactor(s)).height * s).toBeCloseTo(LABEL_BAND_PX + 8, 10)
    }
  })
  test('入力欄の左右の余白は、文字の左の余白(係数倍)と同じ。入力欄の文字は、名前と同じ大きさ', () => {
    for (const k of [1, 4, 8]) {
      expect(labelInputPadding(k)).toBe(labelTextRect(300, k).left)
      expect(labelTypography(k).fontSize).toBe(LABEL_FONT_PX * k)
    }
  })
  test('削除の確認の表示は、名前をつかむ場所の、すぐ下の左端(係数ごとに追従する)', () => {
    for (const k of [1, 4]) {
      const hit = labelHitRect(300, k)
      expect(confirmPanelOffset(300, k)).toEqual({ left: hit.left, top: hit.top + hit.height })
    }
  })
  test('削除の確認は、名前をつかむ場所に重ならない(その下から始まる)', () => {
    for (const k of [1, 2, 8]) {
      for (const w of [80, 120, 300]) {
        const hit = labelHitRect(w, k)
        expect(confirmPanelOffset(w, k).top).toBeGreaterThanOrEqual(hit.top + hit.height)
      }
    }
  })
})
