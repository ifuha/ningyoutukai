import { Fragment, useMemo } from 'react'
import type { ReactNode } from 'react'
import { parseMarkdown, type Block, type Inline } from '#/lib/markdown'

// Markdown の表示(プレビュー・文書の表示)。解釈は `lib/markdown.ts`(生の HTML は描かない、外部の画像は読まない、リンクは安全な形だけ)。
// ここは木を要素にするだけ。`dangerouslySetInnerHTML` は使わない(文字は React がエスケープする)

function renderInline(nodes: Inline[]): ReactNode {
  return nodes.map((n, i) => {
    switch (n.type) {
      case 'text':
        return <Fragment key={i}>{n.text}</Fragment>
      case 'code':
        return (
          <code key={i} className="bg-side-item px-1 py-0.5 font-mono text-[0.9em]">
            {n.text}
          </code>
        )
      case 'strong':
        return (
          <strong key={i} className="font-bold">
            {renderInline(n.children)}
          </strong>
        )
      case 'em':
        return <em key={i}>{renderInline(n.children)}</em>
      case 'del':
        return <del key={i}>{renderInline(n.children)}</del>
      case 'br':
        return <br key={i} />
      case 'link':
        // 別のタブで開く。参照元を渡さない(noreferrer)、検索エンジンに評価を渡さない(nofollow)
        return (
          <a key={i} href={n.href} target="_blank" rel="noopener noreferrer nofollow" className="underline underline-offset-2">
            {renderInline(n.children)}
          </a>
        )
    }
  })
}

const headingClass: Record<number, string> = {
  1: 'mt-6 mb-3 border-b border-line pb-1 text-xl font-bold',
  2: 'mt-5 mb-2 border-b border-line pb-1 text-l font-bold',
  3: 'mt-4 mb-2 text-l font-bold',
  4: 'mt-3 mb-1 text-m font-bold',
  5: 'mt-3 mb-1 text-m font-bold',
  6: 'mt-3 mb-1 text-m font-bold opacity-70',
}

const alignClass = { left: 'text-left', center: 'text-center', right: 'text-right' } as const

function renderBlock(block: Block, key: number): ReactNode {
  switch (block.type) {
    case 'heading': {
      const Tag = `h${block.level}` as 'h1'
      return (
        <Tag key={key} className={headingClass[block.level]}>
          {renderInline(block.children)}
        </Tag>
      )
    }
    case 'paragraph':
      return (
        <p key={key} className="my-2 leading-relaxed break-words">
          {renderInline(block.children)}
        </p>
      )
    case 'code':
      return (
        <pre key={key} data-lang={block.lang || undefined} className="my-3 overflow-x-auto bg-side-item p-3 font-mono text-[0.9em] leading-relaxed">
          <code>{block.text}</code>
        </pre>
      )
    case 'hr':
      return <hr key={key} className="my-4 border-line" />
    case 'quote':
      return (
        <blockquote key={key} className="my-3 border-l-4 border-line pl-3 opacity-80">
          {block.children.map(renderBlock)}
        </blockquote>
      )
    case 'list': {
      const Tag = block.ordered ? 'ol' : 'ul'
      return (
        <Tag key={key} start={block.ordered && block.start !== 1 ? block.start : undefined} className={`my-2 pl-6 ${block.ordered ? 'list-decimal' : 'list-disc'}`}>
          {block.items.map((item, i) => (
            <li key={i} className={`my-1 ${item.checked === null ? '' : 'list-none -ml-6 flex items-baseline gap-2'}`}>
              {item.checked !== null && <input type="checkbox" checked={item.checked} disabled readOnly aria-label={item.checked ? '完了' : '未完了'} className="translate-y-0.5" />}
              <div className="min-w-0 flex-1 [&>p]:my-0">{item.children.map(renderBlock)}</div>
            </li>
          ))}
        </Tag>
      )
    }
    case 'table':
      return (
        <div key={key} className="my-3 overflow-x-auto">
          <table className="border-collapse text-m">
            <thead>
              <tr>
                {block.header.map((cell, c) => (
                  <th key={c} className={`border border-line bg-side-item px-3 py-1 font-bold ${block.align[c] ? alignClass[block.align[c]!] : 'text-left'}`}>
                    {renderInline(cell)}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {block.rows.map((row, r) => (
                <tr key={r}>
                  {row.map((cell, c) => (
                    <td key={c} className={`border border-line px-3 py-1 ${block.align[c] ? alignClass[block.align[c]!] : ''}`}>
                      {renderInline(cell)}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )
  }
}

/** Markdown の本文を表示する。`source` が変わったときだけ、解釈し直す */
export function MarkdownView({ source, className = '' }: { source: string; className?: string }) {
  const blocks = useMemo(() => parseMarkdown(source), [source])
  return (
    <div data-markdown="" className={`text-m break-words ${className}`}>
      {blocks.length === 0 ? <p className="text-ink/50">(内容がありません)</p> : blocks.map(renderBlock)}
    </div>
  )
}
