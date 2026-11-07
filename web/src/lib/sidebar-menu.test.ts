import { describe, expect, test } from 'bun:test'
import { visibleMenuItems } from './context-menu-items'
import { sidebarMenuItems } from './sidebar-menu'

const noop = () => {}
const labels = (hasAvatar: boolean) =>
  visibleMenuItems(
    sidebarMenuItems({ hasAvatar, onChangeAvatar: noop, onDeleteAvatar: noop, onManage: noop }),
  ).map((i) => i.label)

describe('sidebarMenuItems', () => {
  test('アイコンがあるとき: 変更・削除・プロダクト管理', () => {
    expect(labels(true)).toEqual(['アイコンを変更', 'アイコンを削除', 'プロダクト管理'])
  })
  test('アイコンがないとき: 「アイコンを削除」は出ない', () => {
    expect(labels(false)).toEqual(['アイコンを変更', 'プロダクト管理'])
  })
  test('項目を選ぶと、対応する操作が呼ばれる', () => {
    const calls: string[] = []
    const items = sidebarMenuItems({
      hasAvatar: true,
      onChangeAvatar: () => calls.push('change'),
      onDeleteAvatar: () => calls.push('delete'),
      onManage: () => calls.push('manage'),
    })
    for (const i of items) i.onSelect()
    expect(calls).toEqual(['change', 'delete', 'manage'])
  })
})
