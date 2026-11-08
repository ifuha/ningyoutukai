import { describe, expect, test } from 'bun:test'
import {
  HEARTBEAT_MS,
  LOCK_IDLE_MS,
  canStartEditing,
  conflictState,
  editedState,
  heldState,
  idleMsLeftNow,
  isExpiredLocally,
  isWarning,
  warningSeconds,
  type LockState,
} from './edit-lock'

// 編集ロックの画面側の状態: 30 分の編集なしで外れる / 解除の 1 分前に予告 / 外れたら知らせる

const NOW = 1_000_000_000_000
const held = (idleMsLeft: number, at = NOW): Extract<LockState, { kind: 'held' }> =>
  heldState({ idleMsLeft, warnBeforeMs: 60_000 }, at) as Extract<LockState, { kind: 'held' }>

describe('予告(解除の 1 分前)', () => {
  test('あと 1 分より長いうちは、予告しない。1 分以下になったら予告する。外れたら予告ではない', () => {
    const s = held(LOCK_IDLE_MS)
    expect(isWarning(s, NOW)).toBe(false)
    expect(isWarning(s, NOW + LOCK_IDLE_MS - 60_001)).toBe(false)
    expect(isWarning(s, NOW + LOCK_IDLE_MS - 60_000)).toBe(true)
    expect(isWarning(s, NOW + LOCK_IDLE_MS - 1)).toBe(true)
    expect(isWarning(s, NOW + LOCK_IDLE_MS)).toBe(false)
  })
  test('受け取った時刻から、手元で数える(サーバーの返事が 29 分 30 秒前なら、30 秒後に外れる)', () => {
    const s = held(30_000, NOW)
    expect(idleMsLeftNow(s, NOW)).toBe(30_000)
    expect(idleMsLeftNow(s, NOW + 10_000)).toBe(20_000)
    expect(isWarning(s, NOW)).toBe(true)
  })
  test('予告に出す秒数は、切り上げ(最後まで 1 以上)', () => {
    const s = held(60_000)
    expect(warningSeconds(s, NOW)).toBe(60)
    expect(warningSeconds(s, NOW + 500)).toBe(60)
    expect(warningSeconds(s, NOW + 59_001)).toBe(1)
    expect(warningSeconds(s, NOW + 61_000)).toBe(1)
  })
  test('持っていない状態は、予告しない', () => {
    for (const s of [{ kind: 'off' }, { kind: 'acquiring' }, { kind: 'released' }, { kind: 'taken', by: '田中' }] as LockState[]) {
      expect(isWarning(s, NOW)).toBe(false)
    }
  })
  test('サーバーが返した warnBeforeMs を使う', () => {
    const s = heldState({ idleMsLeft: 120_000, warnBeforeMs: 120_000 }, NOW)
    expect(isWarning(s, NOW)).toBe(true)
  })
})

describe('手元で外れたと分かる', () => {
  test('30 分の編集なしの時刻を過ぎたら、サーバーの返事を待たずに「外れた」とみなす', () => {
    const s = held(5_000)
    expect(isExpiredLocally(s, NOW + 4_999)).toBe(false)
    expect(isExpiredLocally(s, NOW + 5_000)).toBe(true)
    expect(isExpiredLocally({ kind: 'off' }, NOW)).toBe(false)
  })
})

describe('編集すると、30 分を数え直す', () => {
  test('入力した瞬間に、予告が消える(あと 30 分に戻る)', () => {
    const s = held(30_000)
    expect(isWarning(s, NOW)).toBe(true)
    const after = editedState(s, NOW + 1_000)
    expect(isWarning(after, NOW + 1_000)).toBe(false)
    expect(idleMsLeftNow(after as Extract<LockState, { kind: 'held' }>, NOW + 1_000)).toBe(LOCK_IDLE_MS)
  })
  test('持っていない状態は、変わらない', () => {
    const released: LockState = { kind: 'released' }
    expect(editedState(released, NOW)).toBe(released)
  })
})

describe('サーバーの 409', () => {
  test('taken は「他の人が編集中」(名前つき。名前がなければ null)。released は「解除された」', () => {
    expect(conflictState({ reason: 'taken', lockedBy: { memberId: 'm1', userName: '田中' } })).toEqual({ kind: 'taken', by: '田中' })
    expect(conflictState({ reason: 'taken', lockedBy: null })).toEqual({ kind: 'taken', by: null })
    expect(conflictState({ reason: 'released', lockedBy: null })).toEqual({ kind: 'released' })
  })
})

describe('編集の入口', () => {
  test('だれも編集していない・自分が編集中なら出す。他の人が編集中なら出さない', () => {
    expect(canStartEditing(null, 'me')).toBe(true)
    expect(canStartEditing({ memberId: 'me' }, 'me')).toBe(true)
    expect(canStartEditing({ memberId: 'other' }, 'me')).toBe(false)
    expect(canStartEditing({ memberId: 'other' }, undefined)).toBe(false)
  })
})

describe('定数', () => {
  test('ハートビートは 30 秒(サーバーが 90 秒で外すので、その 1/3)。30 分はサーバーと同じ', () => {
    expect(HEARTBEAT_MS).toBe(30_000)
    expect(LOCK_IDLE_MS).toBe(30 * 60 * 1000)
  })
})
