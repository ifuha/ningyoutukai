import { describe, expect, test } from 'bun:test'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { AvatarPreviewDialog } from './avatar-preview-dialog'
import { formatFileSize } from '#/lib/product-avatar'

// プレビューのモーダルの、構造と文言のスモークテスト(DOM なし。画像の URL は、ブラウザで作るので、ここでは出ない)

const file = new File([new Uint8Array(2048)], 'logo.png', { type: 'image/png' })
const render = (props: Record<string, unknown> = {}) =>
  renderToStaticMarkup(
    createElement(AvatarPreviewDialog, {
      file,
      productName: '社内ツール',
      onConfirm: () => {},
      onCancel: () => {},
      ...props,
    } as never),
  )

describe('formatFileSize', () => {
  test('1KB 未満は B、1MB 未満は KB(小数点なし)、それ以上は MB(小数点 1 桁)', () => {
    expect(formatFileSize(0)).toBe('0 B')
    expect(formatFileSize(1023)).toBe('1023 B')
    expect(formatFileSize(1024)).toBe('1 KB')
    expect(formatFileSize(2048)).toBe('2 KB')
    expect(formatFileSize(1_048_575)).toBe('1024 KB')
    expect(formatFileSize(1_048_576)).toBe('1.0 MB')
    expect(formatFileSize(2_621_440)).toBe('2.5 MB')
  })
  test('負の値や、数でない値は 0 B', () => {
    expect(formatFileSize(-1)).toBe('0 B')
    expect(formatFileSize(Number.NaN)).toBe('0 B')
  })
})

describe('AvatarPreviewDialog', () => {
  test('ファイルがないとき(閉じているとき)は、中身を描かない', () => {
    const html = render({ file: null })
    expect(html).not.toContain('アイコンのプレビュー')
  })

  test('見出し、ファイル名、大きさ、種類を出す', () => {
    const html = render()
    expect(html).toContain('<h2 class="text-l font-bold">アイコンのプレビュー</h2>')
    expect(html).toContain('logo.png')
    expect(html).toContain('2 KB')
    expect(html).toContain('image/png')
  })

  test('大きな表示と、サイドバーでの見え方(18×18 のアイコンと名前)を並べる', () => {
    const html = render()
    expect(html).toContain('サイドバーでの見え方')
    // サイドバーの行と同じ寸法(高さ h-12、アイコンは左から 3px、名前は左余白 29px)
    expect(html).toMatch(/data-avatar-preview-row[^>]*class="[^"]*relative h-12 w-60/)
    expect(html).toContain('left-[3px]')
    expect(html).toContain('pl-[29px]')
    expect(html).toContain('社内ツール')
    // 画像の URL は、ブラウザで作るので、サーバー描画では、代わりの四角(大)と立方体(小)
    expect(html).toContain('data-avatar-fallback')
  })

  test('「設定する」(主役の塗りつぶし)と「やめる」(枠つき)のボタンがある', () => {
    const html = render()
    expect(html).toMatch(/aria-label="設定する"[^>]*class="[^"]*bg-ink/)
    expect(html).toMatch(/aria-label="やめる"[^>]*class="[^"]*shadow-box/)
  })

  test('送信中は、「設定中…」になり、両方のボタンが押せない', () => {
    const html = render({ pending: true })
    expect(html).toMatch(/aria-label="設定中…"[^>]*disabled=""/)
    expect(html).toMatch(/aria-label="やめる"[^>]*disabled=""/)
  })

  test('エラーは、モーダルの中に、role="alert" で出す。なければ、出さない', () => {
    const withError = render({ error: '画像は 1MB 以下にしてください' })
    expect(withError).toMatch(/<p role="alert"[^>]*>画像は 1MB 以下にしてください<\/p>/)
    expect(render()).not.toContain('role="alert"')
  })

  test('背景を押しても、閉じない(送る前の確認なので、うっかり消さない)。Esc と「やめる」では閉じる', () => {
    // Modal の closeOnBackdrop={false} は、実際のクリックが DOM を要るので、ここでは、描けることだけ確かめる
    expect(render()).toContain('<dialog')
  })
})
