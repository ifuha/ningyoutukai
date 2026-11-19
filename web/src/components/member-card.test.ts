import { describe, expect, test } from 'bun:test'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { MemberCard } from './member-card'
import type { TreeMember, TreeTask } from '#/lib/tree'

// タスクの行の、未読の点(赤い点と、読み上げの名前)

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

const member = (tasks: TreeTask[]): TreeMember => ({
  productMemberId: 'm1',
  userId: 'u1',
  userName: '担当者',
  avatarUrl: null,
  role: 'member',
  sectionId: null,
  positionX: null,
  positionY: null,
  tasks,
  ais: [],
})

const renderCard = (tasks: TreeTask[], props: Partial<Parameters<typeof MemberCard>[0]> = {}) =>
  renderToStaticMarkup(
    createElement(MemberCard, { member: member(tasks), onEditTask: () => {}, ...props }),
  )

describe('タスクの行の未読の点', () => {
  test('未読があると、赤い点と「未読 N 件」の名前が出る', () => {
    const html = renderCard([task({ unreadCount: 2 })])
    expect(html.match(/data-review-dot/g)?.length).toBe(1)
    expect(html).toContain('aria-label="要件整理(未読 2 件)"')
    expect(html).toContain('title="要件整理(未読 2 件)"')
  })

  test('未読 0 なら、点も「未読」も出ない', () => {
    const html = renderCard([task(), task({ unreadCount: 0 })])
    expect(html).not.toContain('data-review-dot')
    expect(html).not.toContain('未読')
  })

  test('タスク名が押せない行(詳細を開けない)でも、点と title は付く', () => {
    const html = renderCard([task({ unreadCount: 1 })], { onEditTask: undefined })
    expect(html).toMatch(/要件整理/)
    expect(html).toContain('title="要件整理(未読 1 件)"')
    expect(html).not.toContain('<button')
  })
})
