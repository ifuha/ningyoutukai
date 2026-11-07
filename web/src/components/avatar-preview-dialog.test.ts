import { describe, expect, test } from 'bun:test'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { AvatarPreviewDialog } from './avatar-preview-dialog'
import { formatFileSize } from '#/lib/product-avatar'

// アイコンを変更するモーダルの、構造と文言のスモークテスト(DOM なし。画像の URL は、ブラウザで作るので、ここでは出ない)

const picked = new File([new Uint8Array(2048)], 'logo.png', { type: 'image/png' })
const render = (props: Record<string, unknown> = {}) =>
  renderToStaticMarkup(
    createElement(AvatarPreviewDialog, {
      open: true,
      file: null,
      productName: '社内ツール',
      onSelectFile: () => {},
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

describe('AvatarPreviewDialog: 開いた直後(画像を選ぶ前)', () => {
  const html = render()
  test('閉じているとき(open=false)は、中身を描かない', () => {
    expect(render({ open: false })).not.toContain('アイコンを変更')
  })
  test('見出し「アイコンを変更」と、画像を選ぶよう促す表示(種類と上限)が出る', () => {
    expect(html).toContain('<h2 class="text-l font-bold">アイコンを変更</h2>')
    expect(html).toContain('画像を選んでください')
    expect(html).toContain('GIF・PNG・JPEG・WebP、1MB 以下')
    expect(html).toContain('data-avatar-preview-empty')
  })
  test('ファイル選択(隠しの input)と、「画像を選ぶ」のボタンが、モーダルの中にある', () => {
    expect(html).toContain('type="file"')
    expect(html).toContain('accept="image/png,image/jpeg,image/gif,image/webp"')
    expect(html).toMatch(/aria-label="画像を選ぶ"/)
  })
  test('「設定する」は、画像を選ぶまで押せない。「やめる」は押せる', () => {
    expect(html).toMatch(/aria-label="設定する"[^>]*disabled=""/)
    expect(html).not.toMatch(/aria-label="やめる"[^>]*disabled=""/)
  })
  test('サイドバーでの見え方は、いまのアイコン(なければ代わりの立方体)と、名前で出る', () => {
    expect(html).toContain('サイドバーでの見え方')
    expect(html).toMatch(/data-avatar-preview-row[^>]*class="[^"]*relative h-12 w-60/)
    expect(html).toContain('left-[3px]')
    expect(html).toContain('pl-[29px]')
    expect(html).toContain('社内ツール')
    expect(html).toContain('data-avatar-fallback')
    const withCurrent = render({ currentUrl: 'https://example.com/current.png' })
    expect(withCurrent).toContain('src="https://example.com/current.png"')
    expect(withCurrent).not.toContain('data-avatar-fallback')
  })
})

describe('AvatarPreviewDialog: 画像を選んだあと', () => {
  const html = render({ file: picked })
  test('ファイル名、大きさ、種類を出す。促す表示は消える', () => {
    expect(html).toContain('logo.png')
    expect(html).toContain('2 KB')
    expect(html).toContain('image/png')
    expect(html).not.toContain('画像を選んでください')
  })
  test('「設定する」(主役の塗りつぶし)が押せる。「別の画像を選ぶ」で選び直せる', () => {
    expect(html).toMatch(/aria-label="設定する"[^>]*class="[^"]*bg-ink/)
    expect(html).not.toMatch(/aria-label="設定する"[^>]*disabled=""/)
    expect(html).toMatch(/aria-label="別の画像を選ぶ"/)
    expect(html).not.toMatch(/aria-label="画像を選ぶ"/)
  })
  test('「やめる」は枠つき', () => {
    expect(html).toMatch(/aria-label="やめる"[^>]*class="[^"]*shadow-box/)
  })
})

describe('AvatarPreviewDialog: 送信中とエラー', () => {
  test('送信中は、「設定中…」になり、3 つのボタンがすべて押せない', () => {
    const html = render({ file: picked, pending: true })
    expect(html).toMatch(/aria-label="設定中…"[^>]*disabled=""/)
    expect(html).toMatch(/aria-label="やめる"[^>]*disabled=""/)
    expect(html).toMatch(/aria-label="別の画像を選ぶ"[^>]*disabled=""/)
  })
  test('エラーは、モーダルの中に、role="alert" で出す。なければ、出さない', () => {
    const withError = render({ error: '画像は 1MB 以下にしてください' })
    expect(withError).toMatch(/<p role="alert"[^>]*>画像は 1MB 以下にしてください<\/p>/)
    expect(render()).not.toContain('role="alert"')
  })
  test('条件に合わない画像を選んだあと(file なし + エラー)も、「設定する」は押せない', () => {
    const html = render({ file: null, error: '画像は GIF・PNG・JPEG・WebP のいずれかにしてください' })
    expect(html).toMatch(/aria-label="設定する"[^>]*disabled=""/)
  })
})
