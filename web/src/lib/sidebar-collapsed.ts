// PC 幅のサイドバーの、開閉(たたんだ状態)の保存。選択は localStorage に残す(ブラウザごと)
export const SIDEBAR_COLLAPSED_KEY = 'ningyoutukai-sidebar-collapsed'

/** 保存された値から、たたんでいるかを決める。'1' のときだけ、たたむ(壊れた値・無い値は、開いたまま) */
export function parseCollapsed(stored: string | null | undefined): boolean {
  return stored === '1'
}

export function serializeCollapsed(collapsed: boolean): string {
  return collapsed ? '1' : '0'
}
