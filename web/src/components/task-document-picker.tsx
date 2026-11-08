import { FileText, Folder } from 'lucide-react'
import { CheckBox } from '#/components/form-controls'
import type { DocDirectory } from '#/lib/document-api'

// タスクの作成・編集のフォームで、**渡す Markdown(文書)**を選ぶ部品。仕様は docs/v4.0/overview.md
// - 渡し方は 2 つ: **ディレクトリで渡す**(中の文書すべて。あとから足した文書も渡る)/ **文書を個別に渡す**。両方使ってよい
// - ディレクトリで渡すと、中の文書は「ディレクトリで渡す」ものとして、チェック済みで出る(個別の選択は要らない)
// - 担当者(と、担当者の AI)が、そのタスクを取ると、選んだ文書が渡る。AI は `pm context <ID>` で読む

export type TaskLinkSelection = { documentIds: string[]; directoryIds: string[] }

/** 選択を切り替える(純粋関数。ディレクトリを選んだら、その中の個別の選択は外す = 重ねて持たない) */
export function toggleDirectory(sel: TaskLinkSelection, dir: Pick<DocDirectory, 'directoryId' | 'documents'>): TaskLinkSelection {
  if (sel.directoryIds.includes(dir.directoryId)) {
    return { ...sel, directoryIds: sel.directoryIds.filter((id) => id !== dir.directoryId) }
  }
  const inside = new Set(dir.documents.map((d) => d.documentId))
  return { documentIds: sel.documentIds.filter((id) => !inside.has(id)), directoryIds: [...sel.directoryIds, dir.directoryId] }
}

export function toggleDocument(sel: TaskLinkSelection, documentId: string): TaskLinkSelection {
  return {
    ...sel,
    documentIds: sel.documentIds.includes(documentId) ? sel.documentIds.filter((id) => id !== documentId) : [...sel.documentIds, documentId],
  }
}

/** 渡される文書の数(ディレクトリ経由と個別の重なりは 1 件) */
export function handedCount(sel: TaskLinkSelection, directories: Pick<DocDirectory, 'directoryId' | 'documents'>[]): number {
  const ids = new Set(sel.documentIds)
  for (const d of directories) if (sel.directoryIds.includes(d.directoryId)) for (const doc of d.documents) ids.add(doc.documentId)
  return ids.size
}

/** 2 つの選択が同じか(順番は問わない) */
export function sameSelection(a: TaskLinkSelection, b: TaskLinkSelection): boolean {
  const same = (x: string[], y: string[]) => x.length === y.length && [...x].sort().join('\n') === [...y].sort().join('\n')
  return same(a.documentIds, b.documentIds) && same(a.directoryIds, b.directoryIds)
}

export function TaskDocumentPicker({
  directories,
  loading,
  error,
  selection,
  onChange,
  disabled,
}: {
  directories: DocDirectory[] | undefined
  loading?: boolean
  error?: string | null
  selection: TaskLinkSelection
  onChange: (next: TaskLinkSelection) => void
  disabled?: boolean
}) {
  return (
    <fieldset className="space-y-2" disabled={disabled}>
      <legend className="block text-m font-medium">
        渡す Markdown
        {directories && directories.length > 0 && <span className="ml-2 text-s font-normal opacity-70">{handedCount(selection, directories)} 件</span>}
      </legend>
      <p className="text-s opacity-70">ディレクトリで渡すと、中の文書すべて(あとから足した文書も)が渡ります。文書を個別に選ぶこともできます。</p>
      {error ? (
        <p role="alert" className="border-l border-line pl-3 text-m">
          ERR {error}
        </p>
      ) : loading || directories === undefined ? (
        <p className="text-m opacity-60">読み込み中…</p>
      ) : directories.length === 0 ? (
        <p className="text-m opacity-70"># 文書がありません(「管理」→「文書」で作れます)</p>
      ) : (
        <ul className="max-h-56 space-y-2 overflow-y-auto shadow-box p-2">
          {directories.map((dir) => {
            const whole = selection.directoryIds.includes(dir.directoryId)
            return (
              <li key={dir.directoryId}>
                <label className="flex cursor-pointer items-center gap-2 text-m font-medium">
                  <CheckBox checked={whole} onChange={() => onChange(toggleDirectory(selection, dir))} aria-label={`${dir.name} をディレクトリごと渡す`} />
                  <Folder size={16} aria-hidden="true" className="shrink-0" />
                  <span className="min-w-0 truncate">{dir.name}</span>
                  <span className="shrink-0 text-s font-normal opacity-60">ディレクトリごと({dir.documents.length})</span>
                </label>
                {dir.documents.length > 0 && (
                  <ul className="ml-6 mt-1 space-y-1">
                    {dir.documents.map((doc) => {
                      const checked = whole || selection.documentIds.includes(doc.documentId)
                      return (
                        <li key={doc.documentId}>
                          <label className={`flex items-center gap-2 text-m ${whole ? 'opacity-60' : 'cursor-pointer'}`}>
                            <CheckBox checked={checked} disabled={whole} onChange={() => onChange(toggleDocument(selection, doc.documentId))} aria-label={`${dir.name}/${doc.name}`} />
                            <FileText size={14} aria-hidden="true" className="shrink-0" />
                            <span className="min-w-0 truncate">{doc.name}</span>
                            {whole && <span className="shrink-0 text-s">(ディレクトリで渡す)</span>}
                          </label>
                        </li>
                      )
                    })}
                  </ul>
                )}
              </li>
            )
          })}
        </ul>
      )}
    </fieldset>
  )
}
