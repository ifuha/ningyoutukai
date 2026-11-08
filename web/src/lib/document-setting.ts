// 文書の自動削除の日数(プロダクトの設定)の、入力の検査。api は 1〜3650 の整数だけ受ける(初期 7 日)
export const AUTO_DELETE_MIN_DAYS = 1
export const AUTO_DELETE_MAX_DAYS = 3650
export const AUTO_DELETE_DEFAULT_DAYS = 7

/** 入力欄の文字から日数を読む。整数でない・範囲外なら null */
export function parseAutoDeleteDays(value: string): number | null {
  if (!/^\d+$/.test(value.trim())) return null
  const n = Number(value.trim())
  return n >= AUTO_DELETE_MIN_DAYS && n <= AUTO_DELETE_MAX_DAYS ? n : null
}

/** 入力の誤り(なければ null) */
export function autoDeleteDaysError(value: string): string | null {
  if (!value.trim()) return '日数を入力してください'
  return parseAutoDeleteDays(value) === null ? `${AUTO_DELETE_MIN_DAYS}〜${AUTO_DELETE_MAX_DAYS} の整数で入力してください` : null
}

/** 日数を、読みやすい文にする(1 週間、2 週間、…。割り切れないときは日) */
export function describeDays(days: number): string {
  if (days % 7 === 0 && days >= 7) return days === 7 ? '7 日(1 週間)' : `${days} 日(${days / 7} 週間)`
  return `${days} 日`
}
