// 右側のパネル(ディレクトリのツリー)の幅を、マウスで変えられるようにするための、画面に依存しない部分。
// 幅は、最小 280px。最大は、置き場所の幅の 70%(ただし 900px まで)。置き場所が狭いときは、最小を優先する

export const PANEL_MIN_PX = 280
export const PANEL_MAX_PX = 900
export const PANEL_MAX_RATIO = 0.7
/** 初めて開いたときの幅(22rem = 352px。これまでの固定の幅) */
export const PANEL_DEFAULT_PX = 352
/** キーボードで変える、1 回あたりの幅(px) */
export const PANEL_KEY_STEP_PX = 16

/** 幅を、許される範囲に収める。数でない値は、既定の幅 */
export function clampPanelWidth(width: number, containerWidth: number): number {
  if (!Number.isFinite(width)) return PANEL_DEFAULT_PX
  const max = Math.max(PANEL_MIN_PX, Math.min(PANEL_MAX_PX, Math.floor(containerWidth * PANEL_MAX_RATIO)))
  return Math.round(Math.min(max, Math.max(PANEL_MIN_PX, width)))
}

/**
 * ドラッグ中の幅。パネルは置き場所の右端に付いているので、幅 = 置き場所の右端 − マウスの位置。
 * 左へ動かすと広がり、右へ動かすと狭まる
 */
export function widthFromPointer(containerRight: number, pointerX: number, containerWidth: number): number {
  return clampPanelWidth(containerRight - pointerX, containerWidth)
}

/** キーボード(← で広げ、→ で狭める。Home で最小、End で最大)。他のキーは null */
export function widthFromKey(current: number, key: string, containerWidth: number): number | null {
  switch (key) {
    case 'ArrowLeft':
      return clampPanelWidth(current + PANEL_KEY_STEP_PX, containerWidth)
    case 'ArrowRight':
      return clampPanelWidth(current - PANEL_KEY_STEP_PX, containerWidth)
    case 'Home':
      return PANEL_MIN_PX
    case 'End':
      return clampPanelWidth(PANEL_MAX_PX, containerWidth)
    default:
      return null
  }
}

const STORAGE_KEY = 'ningyoutukai.documentsPanelWidth'

/** 前回の幅を読む(ブラウザの保存先が使えなくても、既定の幅で動く) */
export function loadPanelWidth(): number {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY)
    const n = raw === null ? Number.NaN : Number(raw)
    return Number.isFinite(n) ? Math.max(PANEL_MIN_PX, Math.min(PANEL_MAX_PX, n)) : PANEL_DEFAULT_PX
  } catch {
    return PANEL_DEFAULT_PX
  }
}

export function savePanelWidth(width: number): void {
  try {
    window.localStorage.setItem(STORAGE_KEY, String(Math.round(width)))
  } catch {
    // 保存できなくても、幅は変えられる
  }
}
