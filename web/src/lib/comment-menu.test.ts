import { describe, expect, test } from 'bun:test'
import { commentMenuItems } from './comment-menu'

describe('commentMenuItems', () => {
  test('編集・削除の 2 項目。この順。「移動」は置かない(位置は、ピンを掴んで動かす)', () => {
    const items = commentMenuItems({ onEdit: () => {}, onDelete: () => {} })
    expect(items.map((i) => i.label)).toEqual(['編集', '削除'])
  })
  test('項目を選ぶと、その操作が呼ばれる', () => {
    const called: string[] = []
    const items = commentMenuItems({ onEdit: () => called.push('edit'), onDelete: () => called.push('delete') })
    for (const item of items) item.onSelect()
    expect(called).toEqual(['edit', 'delete'])
  })
})
