import { describe, expect, test } from 'bun:test'
import { commentMenuItems } from './comment-menu'

describe('commentMenuItems', () => {
  test('編集・移動・削除の 3 項目。この順', () => {
    const items = commentMenuItems({ onEdit: () => {}, onMove: () => {}, onDelete: () => {} })
    expect(items.map((i) => i.label)).toEqual(['編集', '移動', '削除'])
  })
  test('項目を選ぶと、その操作が呼ばれる', () => {
    const called: string[] = []
    const items = commentMenuItems({ onEdit: () => called.push('edit'), onMove: () => called.push('move'), onDelete: () => called.push('delete') })
    for (const item of items) item.onSelect()
    expect(called).toEqual(['edit', 'move', 'delete'])
  })
})
