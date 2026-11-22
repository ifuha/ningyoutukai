import { describe, expect, test } from 'bun:test'
import { completedHistory } from './completed-history'

const task = (taskId: string, status: string, completedAt: string | null, productMemberId = 'm1') => ({
  taskId,
  status,
  completedAt,
  productMemberId,
})

describe('completedHistory', () => {
  test('完了したものだけを、完了日時の新しい順に並べる', () => {
    const list = completedHistory([
      task('a', 'completed', '2026-11-01T00:00:00.000Z'),
      task('b', 'reported', null),
      task('c', 'completed', '2026-11-03T00:00:00.000Z'),
      task('d', 'in_progress', null),
      task('e', 'completed', '2026-11-02T00:00:00.000Z'),
    ])
    expect(list.map((e) => e.task.taskId)).toEqual(['c', 'e', 'a'])
  })

  test('完了日時のないものは最後、同じ日時は taskId 順', () => {
    const list = completedHistory([
      task('z', 'completed', null),
      task('b', 'completed', '2026-11-01T00:00:00.000Z'),
      task('a', 'completed', '2026-11-01T00:00:00.000Z'),
    ])
    expect(list.map((e) => e.task.taskId)).toEqual(['a', 'b', 'z'])
  })

  test('担当者の名前をメンバー一覧から引く。いなければ null', () => {
    const list = completedHistory(
      [task('a', 'completed', '2026-11-02T00:00:00.000Z', 'm1'), task('b', 'completed', '2026-11-01T00:00:00.000Z', 'gone')],
      [{ productMemberId: 'm1', userName: '花子' }],
    )
    expect(list.map((e) => e.assigneeName)).toEqual(['花子', null])
  })

  test('完了したものがなければ空', () => {
    expect(completedHistory([task('a', 'reported', null)])).toEqual([])
  })
})
