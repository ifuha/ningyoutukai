/**
 * 記号の濃さの段階(薄い → 濃い)。ASCII アート風。
 * 背景のドット(`components/dot-field.tsx`)と、読み込み中の表示(`components/loading.tsx`)が、同じ記号を使う
 */
export const RAMP = ['.', ':', '-', '=', '+', '*', '#', '%', '@'] as const
