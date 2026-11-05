import { useEffect, useRef } from 'react'
import { Search } from 'lucide-react'

export type TreeSearchResult = {
  id: string
  kind: 'タスク' | 'セクション' | 'メンバー'
  name: string
  detail?: string
  onSelect: () => void
}

export function TreeSearchPanel({
  query,
  results,
  onQueryChange,
  onClose,
}: {
  query: string
  results: TreeSearchResult[]
  onQueryChange: (value: string) => void
  onClose: () => void
}) {
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    inputRef.current?.focus()
  }, [])

  const selectFirst = () => results[0]?.onSelect()

  return (
    <section
      role="dialog"
      aria-label="プロダクト内を検索"
      className="w-[min(28rem,calc(100vw-1.5rem))] overflow-hidden bg-panel text-ink shadow-box"
      onKeyDown={(event) => {
        if (event.key === 'Escape') {
          event.preventDefault()
          onClose()
        } else if (event.key === 'Enter' && event.target === inputRef.current) {
          event.preventDefault()
          selectFirst()
        }
      }}
    >
      <div className="flex h-12 items-center gap-3 border-b border-line px-3">
        <Search aria-hidden="true" size={20} className="shrink-0 opacity-60" />
        <input
          ref={inputRef}
          type="search"
          aria-label="タスク・セクション・メンバーを検索"
          placeholder="タスク・セクション・メンバーを検索"
          value={query}
          onChange={(event) => onQueryChange(event.currentTarget.value)}
          className="min-w-0 flex-1 bg-transparent text-m outline-none placeholder:text-ink/45"
        />
      </div>
      <div className="max-h-72 overflow-y-auto p-1.5">
        {!query.trim() ? (
          <p className="px-3 py-3 text-sm opacity-60">
            名前の一部を入力すると、候補を表示します
          </p>
        ) : results.length === 0 ? (
          <p className="px-3 py-3 text-sm opacity-60">一致する項目がありません</p>
        ) : (
          <ul aria-label="検索結果" className="space-y-1">
            {results.map((result) => (
              <li key={`${result.kind}:${result.id}`}>
                <button
                  type="button"
                  onClick={result.onSelect}
                  className="flex w-full items-center gap-3 px-3 py-2 text-left hover:bg-side-item focus-visible:bg-side-item focus-visible:outline-2 focus-visible:outline-ink"
                >
                  <span className="w-16 shrink-0 text-xs opacity-60">{result.kind}</span>
                  <span className="min-w-0 flex-1 truncate text-sm">{result.name}</span>
                  {result.detail && (
                    <span className="max-w-32 truncate text-xs opacity-55">{result.detail}</span>
                  )}
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
      <p className="border-t border-line px-3 py-1.5 text-xs opacity-50">
        {query.trim() ? `${results.length} 件` : '名前で検索'}
        {' · Enter で先頭の候補を開く · Esc で閉じる'}
      </p>
    </section>
  )
}
