// 表示の整形(画面に依存しない)。日本語の全角文字は、幅 2 として数えて、表の桁をそろえる

/** 表示上の幅。全角(CJK・全角記号・かな)は 2、それ以外は 1 */
export function displayWidth(text: string): number {
  let width = 0
  for (const ch of text) {
    const c = ch.codePointAt(0) ?? 0
    const wide =
      (c >= 0x1100 && c <= 0x115f) ||
      (c >= 0x2e80 && c <= 0xa4cf) ||
      (c >= 0xac00 && c <= 0xd7a3) ||
      (c >= 0xf900 && c <= 0xfaff) ||
      (c >= 0xfe30 && c <= 0xfe6f) ||
      (c >= 0xff00 && c <= 0xff60) ||
      (c >= 0xffe0 && c <= 0xffe6) ||
      (c >= 0x20000 && c <= 0x3fffd)
    width += wide ? 2 : 1
  }
  return width
}

/** 表示上の幅が `width` になるまで、右に空白を足す(はみ出していれば、そのまま) */
export function padEnd(text: string, width: number): string {
  return text + ' '.repeat(Math.max(0, width - displayWidth(text)))
}

/** 表示上の幅が `max` を超えるときは、末尾を `…` にして切る */
export function truncate(text: string, max: number): string {
  if (displayWidth(text) <= max) return text
  let out = ''
  let width = 0
  for (const ch of text) {
    const w = displayWidth(ch)
    if (width + w > max - 1) break
    out += ch
    width += w
  }
  return `${out}…`
}

/** 行の配列を、桁をそろえた表にする。最初の行は見出し。各列の最大幅は `maxWidths`(なければ制限なし) */
export function renderTable(rows: string[][], maxWidths: (number | undefined)[] = []): string {
  if (rows.length === 0) return ''
  const cols = Math.max(...rows.map((r) => r.length))
  const cells = rows.map((r) =>
    Array.from({ length: cols }, (_, i) => {
      const max = maxWidths[i]
      const value = r[i] ?? ''
      return max ? truncate(value, max) : value
    }),
  )
  const widths = Array.from({ length: cols }, (_, i) => Math.max(...cells.map((r) => displayWidth(r[i] ?? ''))))
  return cells
    .map((r) => r.map((c, i) => (i === cols - 1 ? c : padEnd(c, (widths[i] ?? 0) + 2))).join('').trimEnd())
    .join('\n')
}

const pad2 = (n: number) => String(n).padStart(2, '0')

/** 日時を、この端末のタイムゾーンの `YYYY-MM-DD HH:mm` にする。無い・不正なら `-` */
export function formatDateTime(iso: string | null | undefined): string {
  if (!iso) return '-'
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return '-'
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())} ${pad2(d.getHours())}:${pad2(d.getMinutes())}`
}

/** ID の先頭(表に出す短い形)。`task` コマンドは、この先頭でも探せる */
export const SHORT_ID_LENGTH = 8
export const shortId = (id: string) => id.slice(0, SHORT_ID_LENGTH)
