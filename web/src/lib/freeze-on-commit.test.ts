import { describe, expect, test } from 'bun:test'
import { freezeBeforeCommit } from './freeze-on-commit'
import type { SectionActions } from './use-section-actions'

function fake() {
  const calls: string[] = []
  const actions: SectionActions = {
    notice: { id: 1, message: 'm' } as never,
    dismissNotice: () => calls.push('dismiss'),
    createSection: async (rect) => {
      calls.push(`create:${rect.width}`)
      return null
    },
    updateSection: async (id, patch) => {
      calls.push(`update:${id}:${Object.keys(patch).join(',')}`)
      return true
    },
    deleteSection: async (id) => {
      calls.push(`delete:${id}`)
      return true
    },
    moveMember: async (id, pos, sectionId) => {
      calls.push(`move:${id}:${pos.x},${pos.y}:${String(sectionId)}`)
      return true
    },
  }
  return { calls, actions }
}

describe('freezeBeforeCommit', () => {
  test('作る・更新・削除・カードの移動の、どれも、本来の操作の前に freeze を呼ぶ', async () => {
    const { calls, actions } = fake()
    const wrapped = freezeBeforeCommit(actions, () => calls.push('freeze'))
    await wrapped.createSection({ x: 0, y: 0, width: 300, height: 400 })
    await wrapped.updateSection('s1', { x: 10 } as never)
    await wrapped.deleteSection('s1')
    await wrapped.moveMember('m1', { x: 1, y: 2 }, null)
    expect(calls).toEqual([
      'freeze',
      'create:300',
      'freeze',
      'update:s1:x',
      'freeze',
      'delete:s1',
      'freeze',
      'move:m1:1,2:null',
    ])
  })

  test('引数と戻り値は、そのまま通す(`sectionId` の省略と null も区別したまま)', async () => {
    const { calls, actions } = fake()
    const wrapped = freezeBeforeCommit(actions, () => {})
    expect(await wrapped.updateSection('s1', { sectionName: 'a' } as never)).toBe(true)
    await wrapped.moveMember('m1', { x: 0, y: 0 })
    await wrapped.moveMember('m1', { x: 0, y: 0 }, null)
    await wrapped.moveMember('m1', { x: 0, y: 0 }, 's2')
    expect(calls).toEqual([
      'update:s1:sectionName',
      'move:m1:0,0:undefined',
      'move:m1:0,0:null',
      'move:m1:0,0:s2',
    ])
  })

  test('通知(notice / dismissNotice)は、そのまま渡す。freeze は呼ばない', () => {
    const { calls, actions } = fake()
    const wrapped = freezeBeforeCommit(actions, () => calls.push('freeze'))
    expect(wrapped.notice).toBe(actions.notice)
    wrapped.dismissNotice()
    expect(calls).toEqual(['dismiss'])
  })
})
