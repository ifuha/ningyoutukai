import type { AiTokenInfo } from '#/lib/document-api'

// AI 用のトークンの画面の、画面に依存しない部分。仕様は docs/v4.0/overview.md
export const TOKEN_NAME_MAX = 60
export const TOKEN_DAYS_DEFAULT = 90
export const TOKEN_DAYS_MAX = 365
/** 有効なトークンは、1 人 10 個まで(api と同じ) */
export const TOKEN_ACTIVE_MAX = 10

/** トークンの名前の誤り(なければ null)。どの AI かを見分ける名前 */
export function tokenNameError(name: string): string | null {
  if (!name.trim()) return '名前を入力してください(どの AI かを見分ける名前)'
  if (name.trim().length > TOKEN_NAME_MAX) return `名前は ${TOKEN_NAME_MAX} 文字までです`
  return null
}

/** 期限(日)の入力を読む。1〜365 の整数だけ。範囲外・整数でないものは null */
export function parseTokenDays(value: string): number | null {
  if (!/^\d+$/.test(value.trim())) return null
  const n = Number(value.trim())
  return n >= 1 && n <= TOKEN_DAYS_MAX ? n : null
}

export type TokenState = 'active' | 'expired' | 'revoked'
/** 一覧に出す状態: 取り消し済み / 期限切れ / 有効 */
export function tokenState(t: Pick<AiTokenInfo, 'revokedAt' | 'active'>): TokenState {
  return t.revokedAt ? 'revoked' : t.active ? 'active' : 'expired'
}
export const tokenStateLabel: Record<TokenState, string> = { active: '有効', expired: '期限切れ', revoked: '取り消し済み' }

/** 有効なトークンの数 */
export function activeCount(tokens: Pick<AiTokenInfo, 'revokedAt' | 'active'>[]): number {
  return tokens.filter((t) => tokenState(t) === 'active').length
}

/** 設定の一覧に出すトークン: 取り消し済みは出さない(使えず、もう必要ない)。期限切れは出す(いつ切れたか分かる) */
export function listedTokens<T extends Pick<AiTokenInfo, 'revokedAt' | 'active'>>(tokens: T[]): T[] {
  return tokens.filter((t) => tokenState(t) !== 'revoked')
}

/** AI を動かす環境に設定する行(CLI は環境変数のトークンを、ログインより優先して使う) */
export function envLine(token: string): string {
  return `export NINGYOUTUKAI_TOKEN=${token}`
}
