import type { DocLock, LockConflict } from '#/lib/document-api'

// 文書の編集ロックの、画面側の状態(純粋な部分)。仕様は docs/v4.0/overview.md の 4.11
// - 編集を始めるときにロックを取る。編集中は、30 秒おきに「まだ開いている」と知らせる(ハートビート)。編集があったかも一緒に伝える
// - **30 分間、編集がなければ外れる。解除の 1 分前に、予告を出す。外れたら、「ロックが解除されました」と知らせる**
// - ブラウザを閉じた・通信が切れたときは、サーバーが 90 秒で外す(画面は何もしなくてよい)
// 画面は、サーバーの返事の「あと何ミリ秒で外れるか」を受け取った時刻から、手元で数える(1 秒ごとに更新)

/** ハートビートの間隔(ms)。サーバーが 90 秒で外すので、その 1/3 */
export const HEARTBEAT_MS = 30_000
/** 「30 分の編集なし」で外れるまでの時間(ms)。サーバーの `LOCK_IDLE_MS` と同じ。編集した瞬間に、手元の数え直しに使う */
export const LOCK_IDLE_MS = 30 * 60 * 1000
/** 解除の何ms前に予告を出すか(1 分前)。サーバーが返す `warnBeforeMs` を使うが、返事の前の既定値 */
export const DEFAULT_WARN_BEFORE_MS = 60 * 1000

export type LockState =
  /** 編集していない(ロックを持っていない) */
  | { kind: 'off' }
  /** ロックを取っている最中 */
  | { kind: 'acquiring' }
  /** ロックを持っている。`idleMsLeft` は `at` の時点の値(あと何ms で、30 分の編集なしで外れるか)。`warnBeforeMs` 以下になったら予告 */
  | { kind: 'held'; idleMsLeft: number; warnBeforeMs: number; at: number }
  /** 他の人が編集中(取れなかった、または、外れたあとに他の人が取った)。`by` = 編集している人の名前 */
  | { kind: 'taken'; by: string | null }
  /** 外れた(30 分の編集なし、通信の途絶)。だれも取っていなければ、取り直せる */
  | { kind: 'released' }

/** サーバーの返事(取れた・ハートビートが通った)から、持っている状態を作る */
export function heldState(lock: Pick<DocLock, 'idleMsLeft' | 'warnBeforeMs'>, nowMs: number): LockState {
  return { kind: 'held', idleMsLeft: lock.idleMsLeft, warnBeforeMs: lock.warnBeforeMs, at: nowMs }
}

/** サーバーの 409 から、状態を作る */
export function conflictState(conflict: Pick<LockConflict, 'reason' | 'lockedBy'>): LockState {
  return conflict.reason === 'taken' ? { kind: 'taken', by: conflict.lockedBy?.userName ?? null } : { kind: 'released' }
}

/** いま、あと何ms で外れるか(受け取った時刻から手元で数える。0 以下 = 外れている) */
export function idleMsLeftNow(state: Extract<LockState, { kind: 'held' }>, nowMs: number): number {
  return state.idleMsLeft - (nowMs - state.at)
}

/** 予告を出す時間に入っているか(解除の 1 分前から、外れるまで) */
export function isWarning(state: LockState, nowMs: number): boolean {
  if (state.kind !== 'held') return false
  const left = idleMsLeftNow(state, nowMs)
  return left > 0 && left <= state.warnBeforeMs
}

/** 予告に出す、あと何秒か(切り上げ。1 以上) */
export function warningSeconds(state: Extract<LockState, { kind: 'held' }>, nowMs: number): number {
  return Math.max(1, Math.ceil(idleMsLeftNow(state, nowMs) / 1000))
}

/** 手元で数えて、30 分たったか(サーバーの返事を待たずに「解除されました」と出す) */
export function isExpiredLocally(state: LockState, nowMs: number): boolean {
  return state.kind === 'held' && idleMsLeftNow(state, nowMs) <= 0
}

/** 編集した(文字を入力した・消した)瞬間に、30 分を数え直す(予告が、すぐ消える)。持っていなければ、そのまま */
export function editedState(state: LockState, nowMs: number): LockState {
  return state.kind === 'held' ? { ...state, idleMsLeft: LOCK_IDLE_MS, at: nowMs } : state
}

/** 編集の入口を出してよいか(他の人が編集中のときは出さない) */
export function canStartEditing(editingBy: { memberId: string } | null, myMemberId: string | undefined): boolean {
  return !editingBy || editingBy.memberId === myMemberId
}
