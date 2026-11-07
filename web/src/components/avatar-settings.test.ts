import { describe, expect, test } from 'bun:test'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { AvatarSettingsView } from './avatar-settings'
import { formatFileSize } from '#/lib/product-avatar'

// アイコンの面の、構造と文言のスモークテスト(DOM なし。選んだ画像の URL は、ブラウザで作るので、ここでは出ない)

const picked = new File([new Uint8Array(2048)], 'logo.png', { type: 'image/png' })
const CURRENT = 'https://example.com/current.png'
const render = (props: Record<string, unknown> = {}) =>
  renderToStaticMarkup(
    createElement(AvatarSettingsView, {
      file: null,
      productName: '社内ツール',
      onSelectFile: () => {},
      onConfirm: () => {},
      onClearFile: () => {},
      onAskDelete: () => {},
      onDelete: () => {},
      onCancelDelete: () => {},
      ...props,
    } as never),
  )

describe('formatFileSize', () => {
  test('1KB 未満は B、1MB 未満は KB(小数点なし)、それ以上は MB(小数点 1 桁)', () => {
    expect(formatFileSize(0)).toBe('0 B')
    expect(formatFileSize(1023)).toBe('1023 B')
    expect(formatFileSize(1024)).toBe('1 KB')
    expect(formatFileSize(1_048_576)).toBe('1.0 MB')
  })
})

describe('AvatarSettingsView: 画像を選ぶ前', () => {
  const html = render()
  test('画像を選ぶよう促す表示と、破線の枠だけの大きな表示(アイコンがないとき)', () => {
    expect(html).toContain('画像を選んでください')
    expect(html).toContain('GIF・PNG・JPEG・WebP、1MB 以下')
    expect(html).toContain('data-avatar-preview-empty')
  })
  test('ファイル選択(隠しの input)と「画像を選ぶ」がある。モーダルではなく面に常設', () => {
    expect(html).toContain('type="file"')
    expect(html).toContain('accept="image/png,image/jpeg,image/gif,image/webp"')
    expect(html).toMatch(/aria-label="画像を選ぶ"/)
    expect(html).not.toContain('<dialog')
  })
  test('「設定する」は、画像を選ぶまで押せない。取り消しは出ない', () => {
    expect(html).toMatch(/aria-label="設定する"[^>]*disabled=""/)
    expect(html).not.toContain('選んだ画像を取り消す')
  })
  test('サイドバーでの見え方は、行と同じ寸法で、名前が出る', () => {
    expect(html).toContain('サイドバーでの見え方')
    expect(html).toMatch(/data-avatar-preview-row[^>]*class="[^"]*relative h-12 w-60/)
    expect(html).toContain('left-2')
    expect(html).toContain('pl-[40px]')
    expect(html).toContain('社内ツール')
    expect(html).toContain('data-avatar-fallback')
  })
  test('現在のアイコンがあれば、大きな表示と見え方に出る', () => {
    const withCurrent = render({ currentUrl: CURRENT })
    expect(withCurrent).toContain(`src="${CURRENT}"`)
    expect(withCurrent).toContain('data-avatar-preview-large')
    expect(withCurrent).not.toContain('data-avatar-preview-empty')
    expect(withCurrent).not.toContain('data-avatar-fallback')
  })
})

describe('AvatarSettingsView: 画像を選んだあと', () => {
  const html = render({ file: picked })
  test('ファイル名、大きさ、種類を出す。促す表示は消える', () => {
    expect(html).toContain('logo.png')
    expect(html).toContain('2 KB')
    expect(html).toContain('image/png')
    expect(html).not.toContain('画像を選んでください')
  })
  test('「設定する」(主役)が押せる。「別の画像を選ぶ」と「選んだ画像を取り消す」が出る', () => {
    expect(html).toMatch(/aria-label="設定する"[^>]*class="[^"]*bg-ink/)
    expect(html).not.toMatch(/aria-label="設定する"[^>]*disabled=""/)
    expect(html).toMatch(/aria-label="別の画像を選ぶ"/)
    expect(html).not.toMatch(/aria-label="画像を選ぶ"/)
    expect(html).toMatch(/aria-label="選んだ画像を取り消す"[^>]*class="[^"]*shadow-box/)
  })
})

describe('AvatarSettingsView: 送信中とエラー', () => {
  test('送信中は、「設定中…」になり、ボタンがすべて押せない', () => {
    const html = render({ file: picked, pending: true, currentUrl: CURRENT })
    expect(html).toMatch(/aria-label="設定中…"[^>]*disabled=""/)
    expect(html).toMatch(/aria-label="選んだ画像を取り消す"[^>]*disabled=""/)
    expect(html).toMatch(/aria-label="別の画像を選ぶ"[^>]*disabled=""/)
    expect(html).toMatch(/aria-label="アイコンを削除"[^>]*disabled=""/)
  })
  test('エラーは role="alert" で出す。なければ、出さない', () => {
    const withError = render({ error: '画像は 1MB 以下にしてください' })
    expect(withError).toMatch(/<p role="alert"[^>]*>画像は 1MB 以下にしてください<\/p>/)
    expect(render()).not.toContain('role="alert"')
  })
  test('条件に合わない画像を選んだあと(file なし + エラー)も、「設定する」は押せない', () => {
    const html = render({ file: null, error: '画像は GIF・PNG・JPEG・WebP のいずれかにしてください' })
    expect(html).toMatch(/aria-label="設定する"[^>]*disabled=""/)
  })
})

describe('AvatarSettingsView: アイコンを削除', () => {
  test('現在のアイコンがないときは、出ない', () => {
    const html = render()
    expect(html).not.toContain('アイコンを削除')
    expect(html).not.toContain('削除する')
  })
  test('現在のアイコンがあると「アイコンを削除」が出る(確認はまだ出ない)', () => {
    const html = render({ currentUrl: CURRENT })
    expect(html).toMatch(/aria-label="アイコンを削除"/)
    expect(html).not.toContain('アイコンを削除しますか?')
  })
  test('2 段階目: 確認の文と「削除する」「やめる」。最初のボタンは消える', () => {
    const html = render({ currentUrl: CURRENT, confirmingDelete: true })
    expect(html).toContain('アイコンを削除しますか?')
    expect(html).toMatch(/aria-label="削除する"/)
    expect(html).toMatch(/aria-label="やめる"/)
    expect(html).not.toMatch(/aria-label="アイコンを削除"/)
  })
  test('削除中は、「削除する」「やめる」が押せない', () => {
    const html = render({ currentUrl: CURRENT, confirmingDelete: true, pending: true })
    expect(html).toMatch(/aria-label="削除する"[^>]*disabled=""/)
    expect(html).toMatch(/aria-label="やめる"[^>]*disabled=""/)
  })
})
