import { useEffect, useRef, useState } from 'react'
import {
  cancelRename,
  changeDraft,
  commitRename,
  nameKeyAction,
  startRename,
  type RenameState,
} from '#/lib/section-editor-state'

// セクション名の、その場での編集(札の上に重ねる入力欄)
// Enter か、外のクリック(フォーカスが外れたとき)で確定、Esc で取り消し。判定は `section-editor-state.ts` の関数
// 渡す名前は、前後の空白を取り除いた、1〜50 文字(コードポイント)。空・空白だけ・変更なしのときは、渡さずに閉じる
// 日本語の変換中の Enter は、確定ではなく、変換の確定なので、無視する
// `onCommit`(名前を渡す)か `onCancel`(何も渡さない)の、どちらかが、1 回だけ呼ばれる
export function SectionNameEditor({
  initial,
  className = '',
  onCommit,
  onCancel,
}: {
  /** いまの名前 */
  initial: string
  /** 札と同じ色の塗りなど(下の札の文字を隠すため、塗りは不透明にする) */
  className?: string
  onCommit: (name: string) => void
  onCancel: () => void
}) {
  const [state, setState] = useState<RenameState>(() => startRename(initial))
  const done = useRef(false)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    inputRef.current?.focus()
    inputRef.current?.select()
  }, [])

  const finish = (action: 'commit' | 'cancel') => {
    // Enter のあとの、フォーカスが外れる動きで、二重に呼ばない
    if (done.current) return
    done.current = true
    if (action === 'cancel') {
      setState(cancelRename())
      onCancel()
      return
    }
    const result = commitRename(state)
    setState(result.state)
    if (result.rename === null) onCancel()
    else onCommit(result.rename)
  }

  if (!state.editing) return null
  return (
    <input
      ref={inputRef}
      type="text"
      aria-label="セクション名"
      value={state.draft}
      onChange={(e) => setState((s) => changeDraft(s, e.target.value))}
      onKeyDown={(e) => {
        // 入力中のキーは、キャンバスや、選択中のセクションへのキー操作には渡さない
        e.stopPropagation()
        const action = nameKeyAction({
          key: e.key,
          isComposing: e.nativeEvent.isComposing,
          keyCode: e.keyCode,
        })
        if (action === null) return
        e.preventDefault()
        finish(action)
      }}
      onBlur={() => finish('commit')}
      // 入力欄の中のクリック・ダブルクリックで、キャンバスの移動などが始まらないようにする
      onPointerDown={(e) => e.stopPropagation()}
      onDoubleClick={(e) => e.stopPropagation()}
      className={`pointer-events-auto size-full px-2 text-sm font-bold outline-2 -outline-offset-2 outline-ink ${className}`}
    />
  )
}
