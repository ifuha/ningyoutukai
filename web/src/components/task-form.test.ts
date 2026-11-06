import { describe, expect, test } from 'bun:test'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { TaskForm } from './task-form'
import { Modal } from './modal'

// タスクの作成・編集のフォームの、見た目と文言のスモークテスト(DOM なし。サーバーでのマークアップを検査する)

const member = (id: string, name: string, role: 'leader' | 'member') => ({
  productMemberId: id,
  userId: `u-${id}`,
  userName: name,
  avatarUrl: null,
  role,
  sectionId: null,
  tasks: [],
  positionX: null,
  positionY: null,
})
const L = member('L', 'リーダーA', 'leader')
const M1 = member('M1', 'メンバーB', 'member')

const render = (props: Record<string, unknown>) =>
  renderToStaticMarkup(
    createElement(
      QueryClientProvider,
      { client: new QueryClient() },
      createElement(TaskForm, { productId: 'p1', members: [L, M1], onDone: () => {}, ...props } as never),
    ),
  )

describe('タスクの作成フォーム', () => {
  const html = render({})
  test('見出しは、ラベルより大きい(text-l)。ラベルは太字にしない', () => {
    expect(html).toMatch(/<h2 class="text-l font-bold">タスクを追加<\/h2>/)
    expect(html).toContain('class="block text-m font-medium"')
    expect(html).not.toContain('class="block text-m font-bold"')
  })
  test('タスク名のラベルに、必須の印がある', () => {
    expect(html).toContain('(必須)')
  })
  test('「追加」が主役(塗りつぶし)で、「閉じる」は枠つき', () => {
    expect(html).toMatch(/aria-label="追加"[^>]*class="[^"]*bg-ink/)
    expect(html).toMatch(/aria-label="閉じる"[^>]*class="[^"]*shadow-box/)
  })
  test('担当者は、選べる(label と select が結びつく)', () => {
    expect(html).toContain('for="task-assignee"')
    expect(html).toContain('<select id="task-assignee"')
  })
  test('期限と種類は、横に 2 つ並ぶ(狭い画面では縦)。説明は 2 行', () => {
    expect(html).toContain('grid grid-cols-1 gap-4 sm:grid-cols-2')
    expect(html).toMatch(/id="task-time-limit"[\s\S]*id="task-kind"/)
    expect(html).toMatch(/<textarea[^>]*rows="2"/)
  })
  test('「他のメンバーに公開する」は、フォームの途中ではなく、下のボタンの行の右にある(小さい文字)', () => {
    const publish = html.indexOf('他のメンバーに公開する')
    expect(publish).toBeGreaterThan(html.indexOf('aria-label="閉じる"'))
    expect(html).toMatch(/<label class="ml-auto[^"]*text-s"/)
  })
  test('詳細(説明・期限・種類)は、作成のときは畳んである(open が付かない)。タスク名と担当者は、畳まれない', () => {
    expect(html).toMatch(/<details class="group"><summary[^>]*>[\s\S]*詳細/)
    expect(html).not.toMatch(/<details[^>]*\sopen/)
    // 畳まれるのは、説明・期限・種類だけ(タスク名と担当者は、details の外)
    const detailsAt = html.indexOf('<details')
    expect(html.indexOf('id="task-name"')).toBeLessThan(detailsAt)
    expect(html.indexOf('id="task-assignee"')).toBeLessThan(detailsAt)
    expect(html.indexOf('id="task-description"')).toBeGreaterThan(detailsAt)
    expect(html.indexOf('id="task-kind"')).toBeGreaterThan(detailsAt)
  })
  test('initialMemberId があれば、その人が最初に選ばれている', () => {
    const picked = render({ initialMemberId: 'M1' })
    expect(picked).toMatch(/<option value="M1"[^>]*selected/)
  })
})

describe('タスクの編集フォーム(担当者は固定)', () => {
  const task = { taskId: 't1', taskName: '資料', description: null, timeLimit: null, isVisible: true, taskType: null }
  const html = render({ edit: { task, member: M1 } })
  test('担当者のラベルは、入力欄ではない要素を指さない(label for を使わず、aria-labelledby で結ぶ)', () => {
    expect(html).not.toContain('for="task-assignee"')
    expect(html).toContain('id="task-assignee-label"')
    expect(html).toContain('aria-labelledby="task-assignee-label"')
  })
  test('詳細は、編集のときは開いてある(入っている内容が見える)', () => {
    expect(html).toMatch(/<details[^>]*\sopen/)
  })
  test('見出しは「タスクを編集」、ボタンは「保存」', () => {
    expect(html).toContain('タスクを編集')
    expect(html).toContain('aria-label="保存"')
  })
})

describe('Modal', () => {
  test('背景を押して閉じるかは、closeOnBackdrop で決められる(既定は閉じる)', () => {
    // 実際のクリックは DOM が要るので、ここでは、部品が受け取れて、描けることだけ確かめる
    const closed = renderToStaticMarkup(createElement(Modal, { open: false, onClose: () => {}, closeOnBackdrop: false }, 'x'))
    expect(closed).toContain('<dialog')
  })
})
