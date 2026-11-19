import { describe, expect, test } from 'bun:test'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { TaskListDialog } from './task-list-dialog'
import type { TreeMember, TreeTask } from '#/lib/tree'

// 全タスクの一覧(モーダル)の、未読の点

const task = (patch: Partial<TreeTask> = {}): TreeTask => ({
  taskId: 't1',
  taskName: '要件整理',
  description: null,
  timeLimit: null,
  reportedAt: null,
  status: 'in_progress',
  isVisible: true,
  unreadCount: 0,
  taskType: null,
  ...patch,
})

const member: TreeMember = {
  productMemberId: 'm1',
  userId: 'u1',
  userName: '担当者',
  avatarUrl: null,
  role: 'member',
  sectionId: null,
  positionX: null,
  positionY: null,
  tasks: [task({ unreadCount: 3 }), task({ taskId: 't2', taskName: '実装' })],
  ais: [],
}

const render = () =>
  renderToStaticMarkup(
    createElement(TaskListDialog, { member, onClose: () => {}, onEditTask: () => {} }),
  )

describe('一覧の未読の点', () => {
  test('未読のある行だけ点が付き、名前も「未読 N 件」になる', () => {
    const html = render()
    expect(html.match(/data-review-dot/g)?.length).toBe(1)
    expect(html).toContain('aria-label="要件整理(未読 3 件)"')
    expect(html).toContain('aria-label="実装"')
  })
})
