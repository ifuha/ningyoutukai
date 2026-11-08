import { describe, expect, test } from 'bun:test'
import { isSafeUrl, parseInline, parseMarkdown, type Block, type Inline } from './markdown'

// Markdown の安全な解釈: 生の HTML は文字のまま / 外部の画像は読まない / リンクは安全な形だけ

const text = (t: string): Inline => ({ type: 'text', text: t })

describe('isSafeUrl(リンクに使ってよい URL)', () => {
  test('http・https・mailto と、# / ./ ../ で始まる相対は、よい', () => {
    for (const url of ['https://example.com/a?b=1', 'http://example.com', 'HTTPS://EXAMPLE.COM', 'mailto:a@example.com', '#section', '/products/1', './a.md', '../a.md']) {
      expect(isSafeUrl(url)).toBe(true)
    }
  })
  test('javascript:・data:・vbscript:・file:・空白や制御文字を混ぜた偽装・// で始まる別サイトは、だめ', () => {
    for (const url of ['javascript:alert(1)', 'JavaScript:alert(1)', 'data:text/html,<script>', 'vbscript:x', 'file:///etc/passwd', 'java\tscript:alert(1)', 'java\nscript:alert(1)', ' javascript:alert(1)', '//evil.example/x', '', '   ', 'ftp://example.com', 'example.com/a']) {
      expect(isSafeUrl(url)).toBe(false)
    }
  })
})

describe('インライン', () => {
  test('コード・太字・斜体・取り消し線', () => {
    expect(parseInline('`a*b*`')).toEqual([{ type: 'code', text: 'a*b*' }])
    expect(parseInline('**太字**と*斜体*と~~消す~~')).toEqual([
      { type: 'strong', children: [text('太字')] },
      text('と'),
      { type: 'em', children: [text('斜体')] },
      text('と'),
      { type: 'del', children: [text('消す')] },
    ])
    expect(parseInline('**太字の中の*斜体***')).toEqual([{ type: 'strong', children: [text('太字の中の'), { type: 'em', children: [text('斜体')] }] }])
  })
  test('コードの中は、記法を解釈しない。バッククォートの数を合わせる', () => {
    expect(parseInline('``a ` b``')).toEqual([{ type: 'code', text: 'a ` b' }])
    expect(parseInline('`**x**`')).toEqual([{ type: 'code', text: '**x**' }])
  })
  test('記法でないものは、そのまま文字: 2 * 3 * 4、snake_case_name、閉じていない **', () => {
    expect(parseInline('2 * 3 * 4')).toEqual([text('2 * 3 * 4')])
    expect(parseInline('snake_case_name')).toEqual([text('snake_case_name')])
    expect(parseInline('**閉じていない')).toEqual([text('**閉じていない')])
  })
  test('バックスラッシュで、記法の文字をそのまま出せる', () => {
    expect(parseInline('\\*星\\*')).toEqual([text('*星*')])
  })
  test('リンク: 安全な URL はリンク。危険な URL は、リンクにせず文字だけ(斜体の扱い)', () => {
    expect(parseInline('[公式](https://example.com "題")')).toEqual([{ type: 'link', href: 'https://example.com', children: [text('公式')] }])
    expect(parseInline('[相対](./a.md)')).toEqual([{ type: 'link', href: './a.md', children: [text('相対')] }])
    const bad = parseInline('[悪い](javascript:alert(1))')
    expect(bad.some((n) => n.type === 'link')).toBe(false)
    expect(JSON.stringify(bad)).not.toContain('"href"')
  })
  test('画像は読み込まない: ![代替](URL) は、リンク(安全な URL のとき)か文字だけ。img は作らない', () => {
    const img = parseInline('![図](https://example.com/a.png)')
    expect(img).toEqual([{ type: 'link', href: 'https://example.com/a.png', children: [text('図')] }])
    expect(JSON.stringify(parseInline('![x](data:image/png;base64,AAAA)'))).not.toContain('data:')
  })
  test('<https://…> の自動リンク。ほかの <…>(生の HTML)は、ただの文字', () => {
    expect(parseInline('<https://example.com>')).toEqual([{ type: 'link', href: 'https://example.com', children: [text('https://example.com')] }])
    expect(parseInline('<script>alert(1)</script>')).toEqual([text('<script>alert(1)</script>')])
    expect(parseInline('<img src=x onerror=alert(1)>')).toEqual([text('<img src=x onerror=alert(1)>')])
  })
  test('改行: 行末の空白 2 つか \\ で改行、そうでなければ空白', () => {
    expect(parseInline('a  \nb')).toEqual([text('a'), { type: 'br' }, text('b')])
    expect(parseInline('a\\\nb')).toEqual([text('a'), { type: 'br' }, text('b')])
    expect(parseInline('a\nb')).toEqual([text('a b')])
  })
})

describe('ブロック', () => {
  test('見出し(# 〜 ######)。# のあとに空白がないものは、見出しではない', () => {
    expect(parseMarkdown('# 大\n## 中 ##\n###### 小')).toEqual([
      { type: 'heading', level: 1, children: [text('大')] },
      { type: 'heading', level: 2, children: [text('中')] },
      { type: 'heading', level: 6, children: [text('小')] },
    ])
    expect(parseMarkdown('#見出しではない')[0]!.type).toBe('paragraph')
    expect(parseMarkdown('####### 7 個')[0]!.type).toBe('paragraph')
  })
  test('段落は空行で区切る。続く行は 1 つにつながる', () => {
    expect(parseMarkdown('一行目\n二行目\n\n次の段落')).toEqual([
      { type: 'paragraph', children: [text('一行目 二行目')] },
      { type: 'paragraph', children: [text('次の段落')] },
    ])
  })
  test('コードブロック: 言語つき。中の記法は解釈しない。閉じていなければ最後まで', () => {
    expect(parseMarkdown('```ts\nconst a = **1**\n\nlet b\n```\n後')).toEqual([
      { type: 'code', lang: 'ts', text: 'const a = **1**\n\nlet b' },
      { type: 'paragraph', children: [text('後')] },
    ])
    expect(parseMarkdown('```\n閉じない\n# 見出しにならない')).toEqual([{ type: 'code', lang: '', text: '閉じない\n# 見出しにならない' }])
    expect(parseMarkdown('~~~\nチルダ\n~~~')).toEqual([{ type: 'code', lang: '', text: 'チルダ' }])
  })
  test('コードブロックの中の <script> は、ただの文字', () => {
    const [block] = parseMarkdown('```html\n<script>alert(1)</script>\n```') as Extract<Block, { type: 'code' }>[]
    expect(block!.text).toBe('<script>alert(1)</script>')
  })
  test('区切り線(--- *** ___)。見出しの下線の --- は区切り線', () => {
    for (const line of ['---', '***', '___', '- - -']) expect(parseMarkdown(line)).toEqual([{ type: 'hr' }])
  })
  test('引用(複数行・入れ子・中のブロック)', () => {
    expect(parseMarkdown('> 引用\n> 続き\n>\n> - 項目')).toEqual([
      {
        type: 'quote',
        children: [
          { type: 'paragraph', children: [text('引用 続き')] },
          { type: 'list', ordered: false, start: 1, items: [{ checked: null, children: [{ type: 'paragraph', children: [text('項目')] }] }] },
        ],
      },
    ])
  })
})

describe('一覧', () => {
  const items = (b: Block) => (b as Extract<Block, { type: 'list' }>).items
  test('箇条書きと番号つき(開始の番号を持つ)', () => {
    const [ul, ol] = parseMarkdown('- a\n- b\n\n3. c\n4. d')
    expect(ul).toMatchObject({ type: 'list', ordered: false })
    expect(items(ul!).length).toBe(2)
    expect(ol).toMatchObject({ type: 'list', ordered: true, start: 3 })
    expect(items(ol!).length).toBe(2)
  })
  test('- * + のどれでも箇条書き。項目の間に空行があっても、同じ一覧', () => {
    expect(items(parseMarkdown('* a\n\n* b\n\n* c')[0]!).length).toBe(3)
    expect(items(parseMarkdown('+ a\n+ b')[0]!).length).toBe(2)
  })
  test('入れ子(字下げ)', () => {
    const [list] = parseMarkdown('- 親\n  - 子 1\n  - 子 2\n- 次の親')
    const top = items(list!)
    expect(top.length).toBe(2)
    const nested = top[0]!.children.find((c) => c.type === 'list')!
    expect(items(nested).length).toBe(2)
  })
  test('番号つきの中の箇条書き', () => {
    const [list] = parseMarkdown('1. 手順\n   - 補足\n2. 次')
    expect(items(list!).length).toBe(2)
    expect(items(list!)[0]!.children.some((c) => c.type === 'list')).toBe(true)
  })
  test('チェックリスト: [ ] は false、[x] は true、ふつうの項目は null', () => {
    const [list] = parseMarkdown('- [ ] 未\n- [x] 済\n- [X] 済 2\n- ふつう')
    expect(items(list!).map((i) => i.checked)).toEqual([false, true, true, null])
    expect(items(list!)[0]!.children).toEqual([{ type: 'paragraph', children: [text('未')] }])
  })
  test('一覧のあとの段落は、一覧に入らない', () => {
    const blocks = parseMarkdown('- a\n- b\n\n段落')
    expect(blocks.map((b) => b.type)).toEqual(['list', 'paragraph'])
  })
})

describe('表(GFM)', () => {
  test('見出し・位置(:--- :---: ---:)・行。セルの中は、インラインを解釈する', () => {
    const [table] = parseMarkdown('| 名前 | 数 | 備考 |\n| :--- | ---: | :---: |\n| **a** | 1 | `x` |\n| b | 2 | y |') as Extract<Block, { type: 'table' }>[]
    expect(table!.type).toBe('table')
    expect(table!.header).toEqual([[text('名前')], [text('数')], [text('備考')]])
    expect(table!.align).toEqual(['left', 'right', 'center'])
    expect(table!.rows.length).toBe(2)
    expect(table!.rows[0]![0]).toEqual([{ type: 'strong', children: [text('a')] }])
    expect(table!.rows[0]![2]).toEqual([{ type: 'code', text: 'x' }])
  })
  test('足りないセルは空。区切りの列数が合わなければ、表ではなく段落', () => {
    const [table] = parseMarkdown('a | b\n--- | ---\nonly') as Extract<Block, { type: 'table' }>[]
    expect(table!.rows).toEqual([[[text('only')], []]])
    expect(parseMarkdown('a | b\n--- | --- | ---\nx')[0]!.type).toBe('paragraph')
  })
  test('セルの中の \\| は、区切りではなく文字', () => {
    const [table] = parseMarkdown('| a |\n| --- |\n| x \\| y |') as Extract<Block, { type: 'table' }>[]
    expect(table!.rows[0]![0]).toEqual([text('x | y')])
  })
})

describe('安全(全体)', () => {
  test('生の HTML は、ブロックでも、段落の中でも、ただの文字(要素にならない)', () => {
    const blocks = parseMarkdown('<div onclick="x()">本文</div>\n\n<script>alert(1)</script>\n\n<iframe src="https://evil.example"></iframe>')
    expect(blocks.every((b) => b.type === 'paragraph')).toBe(true)
    const all = JSON.stringify(blocks)
    expect(all).toContain('<script>alert(1)</script>')
    expect(all).not.toContain('"href"')
  })
  test('空・空白だけの文書は、ブロックなし', () => {
    expect(parseMarkdown('')).toEqual([])
    expect(parseMarkdown('  \n\n  ')).toEqual([])
  })
  test('改行コード CRLF・CR も同じに扱う', () => {
    expect(parseMarkdown('# a\r\n\r\nb\rc')).toEqual([
      { type: 'heading', level: 1, children: [text('a')] },
      { type: 'paragraph', children: [text('b c')] },
    ])
  })
  test('深い入れ子や、長い入力でも、止まらない(100 段の引用、1 万行)', () => {
    expect(parseMarkdown('> '.repeat(100) + 'x').length).toBe(1)
    const big = Array.from({ length: 10000 }, (_, i) => `- 項目 ${i}`).join('\n')
    expect((parseMarkdown(big)[0] as Extract<Block, { type: 'list' }>).items.length).toBe(10000)
  })
})
