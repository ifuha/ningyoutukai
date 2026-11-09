import { describe, expect, test } from 'bun:test'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { DirectoryPermissionDialog, DirectoryPermissionList } from './directory-permission-dialog'

const render = (props: Parameters<typeof DirectoryPermissionList>[0]) => renderToStaticMarkup(createElement(DirectoryPermissionList, props))
const members = [
  { memberId: 'm1', userName: '田中', level: 'read' as const },
  { memberId: 'm2', userName: '佐藤', level: 'write' as const },
]

describe('DirectoryPermissionList', () => {
  test('メンバーごとに「読み取りのみ」「読み取りと書き込み」。いまの権限が押された状態(aria-pressed)', () => {
    const html = render({ members, onChange: () => {} })
    expect(html).toContain('田中')
    expect(html).toContain('佐藤')
    expect(html).toContain('aria-label="田中 の権限"')
    // 田中は read、佐藤は write が押されている
    const tanaka = html.slice(html.indexOf('田中'), html.indexOf('佐藤'))
    expect(tanaka.match(/aria-pressed="true"[^>]*>[^<]*読み取りのみ/)).not.toBeNull()
    const sato = html.slice(html.indexOf('佐藤'))
    expect(sato.match(/aria-pressed="true"[^>]*>[^<]*読み取りと書き込み/)).not.toBeNull()
    expect(html.match(/aria-pressed="true"/g)?.length).toBe(2)
  })
  test('変更中のメンバーのボタンは押せない', () => {
    const html = render({ members, pendingMemberId: 'm1', onChange: () => {} })
    const tanaka = html.slice(html.indexOf('田中'), html.indexOf('佐藤'))
    expect(tanaka.match(/disabled=""/g)?.length).toBe(2)
    expect(html.slice(html.indexOf('佐藤'))).not.toContain('disabled=""')
  })
  test('メンバーがいなければ、リーダーは全権限であることを添えた案内', () => {
    const html = render({ members: [], onChange: () => {} })
    expect(html).toContain('リーダー以外のメンバーがいません')
    expect(html).toContain('すべての権限')
  })
})

describe('ダイアログ', () => {
  test('権限のダイアログは、ディレクトリを選ぶまで中身を置かない', () => {
    const html = renderToStaticMarkup(createElement(DirectoryPermissionDialog, { productId: 'p', directory: null, onClose: () => {} }))
    expect(html).not.toContain('の権限')
  })
})
