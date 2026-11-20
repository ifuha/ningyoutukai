import { describe, expect, test } from 'bun:test'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { MemberCard, formatMessageTime } from './member-card'
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

describe('formatMessageTime', () => {
  // 日本時間で 2026/11/19 12:00
  const now = new Date('2026-11-19T03:00:00Z')

  test('今日は「今日 HH:mm」', () => {
    expect(formatMessageTime('2026-11-19T01:23:00Z', now)).toBe('今日 10:23')
  })

  test('昨日は「昨日 HH:mm」', () => {
    expect(formatMessageTime('2026-11-18T14:05:00Z', now)).toBe('昨日 23:05')
  })

  test('日付が変わる境目でも、日本時間の日で分ける', () => {
    // 日本時間で 11/19 00:30 のとき、11/18 23:50 は昨日
    const midnight = new Date('2026-11-18T15:30:00Z')
    expect(formatMessageTime('2026-11-18T14:50:00Z', midnight)).toBe('昨日 23:50')
    // 11/19 00:10 は今日
    expect(formatMessageTime('2026-11-18T15:10:00Z', midnight)).toBe('今日 00:10')
  })

  test('それより前は「YYYY/M/D HH:mm」', () => {
    expect(formatMessageTime('2026-11-16T14:05:00Z', now)).toBe('2026/11/16 23:05')
    expect(formatMessageTime('2020-01-02T03:04:00Z', now)).toBe('2020/1/2 12:04')
  })
})
