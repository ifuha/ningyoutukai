import { FilePlus, X } from 'lucide-react'
import { useState } from 'react'
import { IconButton } from '#/components/icon-button'
import { Modal } from '#/components/modal'
import { contentTooLarge, documentNameError, ensureMdName } from '#/lib/document-tree'

// 文書を追加するダイアログ(ディレクトリの「文書を追加」から)。名前(.md)と、最初の本文(あとから直せる)
// 名前に `.md` がなければ足す。作ったあと、文書のダイアログを開く(親がやる)

export function NewDocumentDialog({
  open,
  directoryName,
  onSubmit,
  onClose,
}: {
  open: boolean
  directoryName: string
  /** 作る。失敗したら例外(メッセージを画面に出す)。成功したら、親が閉じる */
  onSubmit: (input: { name: string; content: string }) => Promise<void>
  onClose: () => void
}) {
  return (
    <Modal open={open} onClose={onClose} closeOnBackdrop={false}>
      {open && <Form directoryName={directoryName} onSubmit={onSubmit} onClose={onClose} />}
    </Modal>
  )
}

function Form({ directoryName, onSubmit, onClose }: { directoryName: string; onSubmit: (input: { name: string; content: string }) => Promise<void>; onClose: () => void }) {
  const [name, setName] = useState('')
  const [content, setContent] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [pending, setPending] = useState(false)

  const submit = async () => {
    const finalName = ensureMdName(name)
    const problem = documentNameError(finalName) ?? (contentTooLarge(content) ? '本文は 1MB までです' : null)
    if (problem) return setError(problem)
    setPending(true)
    setError(null)
    try {
      await onSubmit({ name: finalName, content })
    } catch (e) {
      setError(e instanceof Error ? e.message : '作れませんでした。時間をおいて、もう一度お試しください')
      setPending(false)
    }
  }

  return (
    <form
      className="space-y-3 bg-panel p-4 text-ink"
      onSubmit={(e) => {
        e.preventDefault()
        void submit()
      }}
    >
      <h2 className="text-l font-bold">文書を追加</h2>
      <p className="text-m opacity-70">場所: {directoryName}</p>
      <label className="block space-y-1">
        <span className="text-m">名前(.md は自動で付きます)</span>
        <input
          autoFocus
          value={name}
          maxLength={100}
          disabled={pending}
          placeholder="例: spec"
          onChange={(e) => setName(e.target.value)}
          className="block h-9 w-full bg-transparent px-2 text-m shadow-box outline-none placeholder:text-ink/45"
        />
      </label>
      <label className="block space-y-1">
        <span className="text-m">最初の本文(あとから直せます。空でもよい)</span>
        <textarea
          rows={8}
          value={content}
          disabled={pending}
          placeholder="# 見出し"
          onChange={(e) => setContent(e.target.value)}
          className="block max-h-[50dvh] w-full resize-y bg-transparent p-2 font-mono text-m shadow-box outline-none placeholder:text-ink/45"
        />
      </label>
      {error && (
        <p role="alert" className="text-s text-danger">
          {error}
        </p>
      )}
      <div className="flex justify-end gap-2">
        <IconButton icon={X} label="やめる" showLabel variant="outline" disabled={pending} onClick={onClose} />
        <IconButton icon={FilePlus} label={pending ? '追加中…' : '追加'} showLabel variant="solid" type="submit" disabled={pending || !name.trim()} />
      </div>
    </form>
  )
}
