// Markdown の、小さくて安全な解釈。仕様は docs/v4.0/overview.md(画面 3: 安全)
// - **生の HTML は描かない**: `<script>` などは、ただの文字として出す(React が文字をエスケープする。`dangerouslySetInnerHTML` は使わない)
// - **外部の画像は読み込まない**: `![代替文字](URL)` は、画像ではなく、代替文字のリンク(追跡・漏えいを防ぐ)
// - **リンクは安全な形だけ**: `https:` `http:` `mailto:` と、`#` `/` で始まる相対のもの。`javascript:` `data:` などは、リンクにしない(文字だけ)
// - 描くもの: 見出し、段落、箇条書き(入れ子・チェックリスト)、番号つきの一覧、コードブロック、引用、区切り線、表、太字・斜体・取り消し線・コード・リンク
// この関数は、文字列を「木」にするだけ。描くのは `components/markdown-view.tsx`

export type Inline =
  | { type: 'text'; text: string }
  | { type: 'code'; text: string }
  | { type: 'strong'; children: Inline[] }
  | { type: 'em'; children: Inline[] }
  | { type: 'del'; children: Inline[] }
  | { type: 'link'; href: string; children: Inline[] }
  | { type: 'br' }

export type Align = 'left' | 'center' | 'right' | null

export type Block =
  | { type: 'heading'; level: 1 | 2 | 3 | 4 | 5 | 6; children: Inline[] }
  | { type: 'paragraph'; children: Inline[] }
  | { type: 'code'; lang: string; text: string }
  | { type: 'list'; ordered: boolean; start: number; items: ListItem[] }
  | { type: 'quote'; children: Block[] }
  | { type: 'hr' }
  | { type: 'table'; header: Inline[][]; align: Align[]; rows: Inline[][][] }

/** 一覧の項目。`checked` は、チェックリスト(`- [ ]` `- [x]`)のときだけ true / false(そうでなければ null) */
export type ListItem = { checked: boolean | null; children: Block[] }

/** リンクに使ってよい URL か。許す: http・https・mailto と、`#` `/` `./` `../` で始まる相対 */
export function isSafeUrl(url: string): boolean {
  const u = url.trim()
  if (!u) return false
  // 制御文字・空白を使った偽装(`java\tscript:`)を許さない
  // eslint-disable-next-line no-control-regex
  if (/[\u0000-\u001f\u007f\s]/.test(u)) return false
  if (/^(https?:|mailto:)/i.test(u)) return true
  if (/^[#/]/.test(u) || /^\.{1,2}\//.test(u)) return !/^\/\//.test(u) // `//evil.example` は、別のサイトへ飛ぶので許さない
  return false
}

// ---- インライン ----

/** 行の中身を、インラインの木にする。壊れた記法は、そのまま文字として残す */
export function parseInline(src: string): Inline[] {
  const out: Inline[] = []
  let text = ''
  const flush = () => {
    if (text) out.push({ type: 'text', text })
    text = ''
  }
  let i = 0
  while (i < src.length) {
    const ch = src[i]!
    // 改行の直前に空白 2 つ以上、または `\`: 改行
    if (ch === '\n') {
      const trailing = /( {2,}|\\)$/.test(text)
      text = text.replace(/( {2,}|\\)$/, '')
      flush()
      if (trailing) out.push({ type: 'br' })
      else text = ' '
      i++
      continue
    }
    if (ch === '\\' && i + 1 < src.length && /[\\`*_{}[\]()#+\-.!~|>]/.test(src[i + 1]!)) {
      text += src[i + 1]
      i += 2
      continue
    }
    // コード: `...`(バッククォートの数を合わせる)
    if (ch === '`') {
      const run = /^`+/.exec(src.slice(i))![0]
      const close = src.indexOf(run, i + run.length)
      if (close !== -1) {
        flush()
        out.push({ type: 'code', text: src.slice(i + run.length, close).replace(/^ (.*) $/s, '$1') })
        i = close + run.length
        continue
      }
      text += run
      i += run.length
      continue
    }
    // 画像: ![代替文字](URL) → 画像は読み込まず、代替文字のリンクにする(URL が安全なときだけ)
    // リンク: [文字](URL "題")
    if (ch === '[' || (ch === '!' && src[i + 1] === '[')) {
      const image = ch === '!'
      const start = image ? i + 1 : i
      const m = /^\[((?:[^\]\\]|\\.)*)\]\(\s*(<[^>]*>|[^)\s]*)(?:\s+(?:"[^"]*"|'[^']*'))?\s*\)/.exec(src.slice(start))
      if (m) {
        flush()
        const label = m[1]!
        const href = m[2]!.replace(/^<|>$/g, '')
        const children = parseInline(label || href)
        out.push(isSafeUrl(href) ? { type: 'link', href, children } : { type: 'em', children: image ? [{ type: 'text', text: label || '画像' }] : children })
        i = start + m[0].length
        continue
      }
    }
    // 自動リンク: <https://…>
    if (ch === '<') {
      const m = /^<((?:https?:\/\/|mailto:)[^\s<>]+)>/i.exec(src.slice(i))
      if (m) {
        flush()
        out.push({ type: 'link', href: m[1]!, children: [{ type: 'text', text: m[1]! }] })
        i += m[0].length
        continue
      }
    }
    // 太字 **...** / __...__、取り消し線 ~~...~~、斜体 *...* / _..._
    const pair = (marker: string, type: 'strong' | 'del' | 'em') => {
      if (!src.startsWith(marker, i)) return false
      let end = src.indexOf(marker, i + marker.length)
      if (end === -1 || end === i + marker.length) return false
      // 閉じの記号が続くとき(`**太字の中の*斜体***`)は、いちばん後ろの組を閉じにする(手前の記号は、中の記法の閉じ)
      while (src[end + marker.length] === marker[0]) end++
      // 前後に空白があるものは、記法ではない(`2 * 3 * 4`)
      const inner = src.slice(i + marker.length, end)
      if (/^\s|\s$/.test(inner)) return false
      // 単語の中の `_`(snake_case)は斜体にしない
      if (marker === '_' && /\w/.test(src[i - 1] ?? '') ) return false
      flush()
      out.push({ type, children: parseInline(inner) })
      i = end + marker.length
      return true
    }
    if (pair('**', 'strong') || pair('__', 'strong') || pair('~~', 'del') || pair('*', 'em') || pair('_', 'em')) continue
    text += ch
    i++
  }
  flush()
  return mergeText(out)
}

/** 隣り合う文字(`text`)を 1 つにまとめる(改行を空白にしたあとの文字などが、つながるように) */
function mergeText(nodes: Inline[]): Inline[] {
  const merged: Inline[] = []
  for (const n of nodes) {
    const last = merged[merged.length - 1]
    if (n.type === 'text' && last?.type === 'text') merged[merged.length - 1] = { type: 'text', text: last.text + n.text }
    else merged.push(n)
  }
  return merged
}

// ---- ブロック ----

const FENCE = /^ {0,3}(`{3,}|~{3,})\s*([^\s`]*)\s*$/
const HEADING = /^ {0,3}(#{1,6})[ \t]+(.*?)(?:[ \t]+#+)?[ \t]*$/
const HR = /^ {0,3}([-*_])(?:[ \t]*\1){2,}[ \t]*$/
const LIST_ITEM = /^( *)([-*+]|\d{1,9}[.)])[ \t]+(.*)$/
const QUOTE = /^ {0,3}>[ ]?(.*)$/
const TABLE_SEPARATOR = /^[ \t]*\|?[ \t]*:?-+:?[ \t]*(?:\|[ \t]*:?-+:?[ \t]*)*\|?[ \t]*$/

const indentOf = (line: string) => /^ */.exec(line)![0].length

function splitRow(line: string): string[] {
  let s = line.trim()
  if (s.startsWith('|')) s = s.slice(1)
  if (s.endsWith('|') && !s.endsWith('\\|')) s = s.slice(0, -1)
  const cells: string[] = []
  let cell = ''
  for (let i = 0; i < s.length; i++) {
    if (s[i] === '\\' && s[i + 1] === '|') {
      cell += '|'
      i++
    } else if (s[i] === '|') {
      cells.push(cell.trim())
      cell = ''
    } else cell += s[i]
  }
  cells.push(cell.trim())
  return cells
}

const alignOf = (cell: string): Align => {
  const left = cell.startsWith(':')
  const right = cell.endsWith(':')
  return left && right ? 'center' : right ? 'right' : left ? 'left' : null
}

/** 次の行が、段落を中断するブロックの始まりか */
function startsBlock(line: string, next: string | undefined): boolean {
  return FENCE.test(line) || HEADING.test(line) || HR.test(line) || QUOTE.test(line) || LIST_ITEM.test(line) || (line.includes('|') && next !== undefined && TABLE_SEPARATOR.test(next) && next.includes('-'))
}

/** Markdown を、ブロックの木にする */
export function parseMarkdown(source: string): Block[] {
  const lines = source.replace(/\r\n?/g, '\n').split('\n')
  return parseBlocks(lines)
}

function parseBlocks(lines: string[]): Block[] {
  const blocks: Block[] = []
  let i = 0
  while (i < lines.length) {
    const line = lines[i]!
    if (!line.trim()) {
      i++
      continue
    }

    // コードブロック(閉じていなければ、最後まで)
    const fence = FENCE.exec(line)
    if (fence) {
      const marker = fence[1]!
      const body: string[] = []
      i++
      while (i < lines.length && !new RegExp(`^ {0,3}${marker[0] === '`' ? '`' : '~'}{${marker.length},}\\s*$`).test(lines[i]!)) body.push(lines[i++]!)
      i++ // 閉じの行
      blocks.push({ type: 'code', lang: fence[2] ?? '', text: body.join('\n') })
      continue
    }

    const heading = HEADING.exec(line)
    if (heading) {
      blocks.push({ type: 'heading', level: heading[1]!.length as 1 | 2 | 3 | 4 | 5 | 6, children: parseInline(heading[2]!) })
      i++
      continue
    }

    if (HR.test(line)) {
      blocks.push({ type: 'hr' })
      i++
      continue
    }

    // 引用: `>` で始まる行(続く行も)を集めて、中身をもう一度解釈する
    if (QUOTE.test(line)) {
      const inner: string[] = []
      while (i < lines.length && QUOTE.test(lines[i]!)) inner.push(QUOTE.exec(lines[i]!)![1]!), i++
      blocks.push({ type: 'quote', children: parseBlocks(inner) })
      continue
    }

    // 表(GFM): 見出しの行と、区切りの行(---)
    if (line.includes('|') && i + 1 < lines.length && TABLE_SEPARATOR.test(lines[i + 1]!) && lines[i + 1]!.includes('-')) {
      const header = splitRow(line)
      const sepCells = splitRow(lines[i + 1]!)
      if (header.length === sepCells.length) {
        const rows: Inline[][][] = []
        i += 2
        while (i < lines.length && lines[i]!.trim() && !FENCE.test(lines[i]!) && !HEADING.test(lines[i]!) && !HR.test(lines[i]!) && !QUOTE.test(lines[i]!) && !LIST_ITEM.test(lines[i]!)) {
          const cells = splitRow(lines[i++]!)
          rows.push(header.map((_, c) => parseInline(cells[c] ?? '')))
        }
        blocks.push({ type: 'table', header: header.map((h) => parseInline(h)), align: sepCells.map(alignOf), rows })
        continue
      }
    }

    // 一覧
    const item = LIST_ITEM.exec(line)
    if (item) {
      const { block, next } = parseList(lines, i)
      blocks.push(block)
      i = next
      continue
    }

    // 段落: 空行か、別のブロックの始まりまで
    const para: string[] = [line.trim()]
    i++
    while (i < lines.length && lines[i]!.trim() && !startsBlock(lines[i]!, lines[i + 1])) para.push(lines[i++]!.trim())
    blocks.push({ type: 'paragraph', children: parseInline(para.join('\n')) })
  }
  return blocks
}

/** 一覧 1 つ(同じ種類・同じ字下げの項目の並び)。項目の下に字下げされた行があれば、その項目の中身(入れ子の一覧など) */
function parseList(lines: string[], start: number): { block: Block; next: number } {
  const first = LIST_ITEM.exec(lines[start]!)!
  const baseIndent = first[1]!.length
  const ordered = /\d/.test(first[2]!)
  const startNumber = ordered ? Number.parseInt(first[2]!, 10) : 1
  const items: ListItem[] = []
  let i = start
  while (i < lines.length) {
    const m = LIST_ITEM.exec(lines[i]!)
    // 同じ字下げで、同じ種類の項目だけ、この一覧の項目
    if (!m || m[1]!.length !== baseIndent || /\d/.test(m[2]!) !== ordered) break
    let text = m[3]!
    let checked: boolean | null = null
    const task = /^\[([ xX])\][ \t]+(.*)$/.exec(text)
    if (task) {
      checked = task[1] !== ' '
      text = task[2]!
    }
    const body: string[] = [text]
    i++
    // 項目の中身: 字下げされた行(空行をはさんでもよい)
    while (i < lines.length) {
      const l = lines[i]!
      if (!l.trim()) {
        const nextLine = lines.slice(i + 1).find((x) => x.trim())
        if (nextLine !== undefined && indentOf(nextLine) > baseIndent) {
          body.push('')
          i++
          continue
        }
        break
      }
      if (indentOf(l) > baseIndent) {
        body.push(l.slice(Math.min(indentOf(l), baseIndent + 2 + (ordered ? 1 : 0)) ))
        i++
        continue
      }
      break
    }
    items.push({ checked, children: parseBlocks(body) })
    // 項目どうしの間の空行は、読み飛ばす(同じ一覧が続くなら)
    let j = i
    while (j < lines.length && !lines[j]!.trim()) j++
    const peek = j < lines.length ? LIST_ITEM.exec(lines[j]!) : null
    if (peek && peek[1]!.length === baseIndent && /\d/.test(peek[2]!) === ordered) i = j
  }
  return { block: { type: 'list', ordered, start: startNumber, items }, next: i }
}

