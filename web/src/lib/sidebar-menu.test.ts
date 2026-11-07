import { describe, expect, test } from 'bun:test'
import { visibleMenuItems } from './context-menu-items'
import { sidebarMenuItems } from './sidebar-menu'

describe('sidebarMenuItems', () => {
  test('項目は「プロダクト設定」の 1 つだけ(アイコンの変更・削除は、メニューに出さない)', () => {
    const items = visibleMenuItems(sidebarMenuItems({ onOpenSettings: () => {} }))
    expect(items.map((i) => i.label)).toEqual(['プロダクト設定'])
  })
  test('項目を選ぶと、設定を開く操作が呼ばれる', () => {
    const calls: string[] = []
    const items = sidebarMenuItems({ onOpenSettings: () => calls.push('settings') })
    for (const i of items) i.onSelect()
    expect(calls).toEqual(['settings'])
  })
})
