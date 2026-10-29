// 招待の候補(api の GET .../invitation/candidate の 1 件)から、入力欄に入れる値を決める。
// GitHub の username があればそれ、なければメール(api は、username を持つ人にはメールを返さない)
export type InviteCandidate = {
  userId: string
  userName: string
  githubId: string | null
  email: string | null
  avatarUrl: string | null
}

export function candidateValue(c: Pick<InviteCandidate, 'githubId' | 'email'>): string {
  return c.githubId ?? c.email ?? ''
}

/** ↑↓ で選択を動かす(端で折り返す)。選択なし(-1)から ↓ は先頭、↑ は末尾 */
export function moveActive(current: number, delta: 1 | -1, length: number): number {
  if (length === 0) return -1
  if (current < 0) return delta === 1 ? 0 : length - 1
  return (current + delta + length) % length
}
