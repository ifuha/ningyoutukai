import { describe, expect, test } from 'bun:test'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { CommentDraft } from './comment-draft'
import { CommentPin } from './comment-pin'
import { CanvasViewContext } from '#/lib/canvas-view'
import type { ProductComment } from '#/lib/comment-api'

const comment = (patch: Partial<ProductComment> = {}): ProductComment => ({
  commentId: 7,
  productId: 'p1',
  content: 'ここを見てください',
  x: 100,
  y: 200,
  authorName: 'リーダー',
  authorAvatarUrl: null,
  createdBy: 'u1',
  canEdit: true,
  createdAt: '2026-11-07T00:00:00.000Z',
  updatedAt: '2026-11-07T00:00:00.000Z',
  ...patch,
})

const view = { scale: 1, toCanvas: (p: { x: number; y: number }) => p }
const renderPin = (props: Partial<Parameters<typeof CommentPin>[0]> = {}) =>
  renderToStaticMarkup(
    createElement(CanvasViewContext.Provider, { value: view }, createElement(CommentPin, { comment: comment(), onUpdate: () => {}, onDelete: () => {}, ...props })),
  )

describe('CommentPin', () => {
  test('ピンは作成者のアバター。画像があれば画像、なければ名前の頭文字、名前もなければコメントのアイコン', () => {
    const withImage = renderPin({ comment: comment({ authorAvatarUrl: 'https://example.com/a.png' }) })
    expect(withImage).toContain('src="https://example.com/a.png"')
    // 画像のドラッグ(ブラウザ標準)が、ピンを掴んで動かす操作を打ち切らないよう、画像はドラッグさせない
    expect(withImage).toContain('draggable="false"')
    expect(withImage).toContain('pointer-events-none')
    expect(withImage).not.toContain('data-comment-initial')
    expect(renderPin()).toMatch(/data-comment-initial[^>]*>リ</)
    const none = renderPin({ comment: comment({ authorName: null }) })
    expect(none).not.toContain('data-comment-initial')
    expect(none).toContain('lucide-message-square')
  })
  test('開いたカードにも、作成者のアバターと名前が出る', () => {
    const html = renderPin({ defaultOpen: true, comment: comment({ authorAvatarUrl: 'https://example.com/a.png' }) })
    expect(html.match(/src="https:\/\/example\.com\/a\.png"/g)?.length).toBe(2)
    expect(html).toContain('data-comment-author')
  })
  test('座標の位置に置く(offset を足す)。閉じているときは、ピンだけで、本文は出ない', () => {
    const html = renderPin({ offsetX: 10, offsetY: 20 })
    expect(html).toContain('left:110px;top:220px')
    expect(html).toContain('aria-label="コメントを開く"')
    expect(html).toContain('aria-expanded="false"')
    expect(html).not.toContain('ここを見てください')
  })
  test('開くと、作成者の名前と本文が出る。作成者が退会していたら「退会したユーザー」', () => {
    const html = renderPin({ defaultOpen: true })
    expect(html).toContain('aria-expanded="true"')
    expect(html).toContain('リーダー')
    expect(html).toContain('ここを見てください')
    expect(renderPin({ defaultOpen: true, comment: comment({ authorName: null }) })).toContain('退会したユーザー')
  })
  test('編集できる人(canEdit)には、動かせる見た目(grab)と、メニューがあることの印(aria-haspopup)。編集・削除のボタンは、カードに常には置かない(メニューから出す)', () => {
    const html = renderPin({ defaultOpen: true })
    expect(html).toContain('cursor-grab')
    expect(html).toContain('aria-haspopup="menu"')
    expect(html).not.toContain('aria-label="編集"')
    expect(html).not.toContain('aria-label="削除"')
  })
  test('編集できる人のカードには、右上に「…」のメニューボタンがある。編集できない人には出ない', () => {
    expect(renderPin({ defaultOpen: true })).toContain('aria-label="メニュー"')
    expect(renderPin({ defaultOpen: true, comment: comment({ canEdit: false }) })).not.toContain('aria-label="メニュー"')
    // 閉じているときは、カードごと出ない
    expect(renderPin()).not.toContain('aria-label="メニュー"')
  })
  test('開いたカードは、ふわっと現れる動き(comment-card-in)つき', () => {
    expect(renderPin({ defaultOpen: true })).toContain('comment-card-in')
    expect(renderPin()).not.toContain('comment-card-in')
  })
  test('編集できない人(メンバー)には、「編集」「削除」を出さず、動かせない(pointer)', () => {
    const html = renderPin({ defaultOpen: true, comment: comment({ canEdit: false }) })
    expect(html).toContain('ここを見てください')
    expect(html).not.toContain('aria-haspopup')
    expect(html).not.toContain('cursor-grab')
  })
  test('本文は改行を残し、長い語でも折り返す', () => {
    const html = renderPin({ defaultOpen: true })
    expect(html).toContain('whitespace-pre-wrap')
    expect(html).toContain('break-words')
  })
})

describe('拡大縮小に合わせた大きさ(セクションの名前と同じ)', () => {
  const pinAt = (scale: number) =>
    renderToStaticMarkup(
      createElement(
        CanvasViewContext.Provider,
        { value: { ...view, scale } },
        createElement(CommentPin, { comment: comment(), onUpdate: () => {}, onDelete: () => {} }),
      ),
    )
  const draftAt = (scale: number) =>
    renderToStaticMarkup(
      createElement(
        CanvasViewContext.Provider,
        { value: { ...view, scale } },
        createElement(CommentDraft, { x: 5, y: 6, onSubmit: async () => {}, onCancel: () => {} }),
      ),
    )
  test('縮小(scale < 1)では、左上を起点に 1 / scale 倍にして、画面上の大きさを保つ。位置(左上)は変わらない', () => {
    const pin = pinAt(0.5)
    expect(pin).toContain('left:100px;top:200px')
    expect(pin).toContain('transform:scale(2)')
    expect(pin).toContain('transform-origin:top left')
    expect(draftAt(0.5)).toContain('transform:scale(2)')
  })
  test('拡大・等倍では、何も掛けない(キャンバスの拡大に比例)', () => {
    for (const scale of [1, 2]) {
      expect(pinAt(scale)).not.toContain('transform:scale(')
      expect(draftAt(scale)).not.toContain('transform:scale(')
    }
  })
})

describe('CommentDraft', () => {
  const renderDraft = () => renderToStaticMarkup(createElement(CommentDraft, { x: 5, y: 6, offsetX: 1, offsetY: 2, onSubmit: async () => {}, onCancel: () => {} }))
  test('置いた位置に、入力欄とボタンが出る。内容が空の間は「コメントする」が押せない', () => {
    const html = renderDraft()
    expect(html).toContain('left:6px;top:8px')
    expect(html).toContain('aria-label="コメントの内容"')
    expect(html).toContain('maxLength="2000"')
    expect(html).toContain('コメントする')
    expect(html).toMatch(/<button[^>]*disabled=""[^>]*aria-label="コメントする"|<button[^>]*aria-label="コメントする"[^>]*disabled=""/)
  })
  test('入力欄と送信のボタンは、横に並べる(flex)。ボタンはアイコンだけで、文字は出さない(名前はツールチップ)', () => {
    const html = renderDraft()
    expect(html).toContain('flex items-end gap-2')
    // 入力欄の高さは、1 行のとき、ボタン(sm = 32px = size-8)と同じ(min-h-8)
    expect(html).toContain('min-h-8')
    expect(html).toContain('rows="1"')
    expect(html).toContain('size-8')
    expect(html.indexOf('<textarea')).toBeLessThan(html.indexOf('type="submit"'))
    expect(html).not.toMatch(/<span class="text-m font-medium">コメントする<\/span>/)
  })
  test('「やめる」のボタンと、メールの案内の文は置かない(キャンセルは Esc)', () => {
    const html = renderDraft()
    expect(html).not.toContain('やめる')
    expect(html).not.toContain('メールで知らせます')
  })
})
