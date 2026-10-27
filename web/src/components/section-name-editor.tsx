import { useEffect, useRef, useState } from 'react'
import {
  cancelRename,
  changeDraft,
  commitRename,
  nameKeyAction,
  startRename,
  type RenameState,
} from '#/lib/section-editor-state'
import { labelInputPadding, labelTypography } from '#/lib/section-label'

// セクション名の、その場での編集(札の上に重ねる入力欄)
// Enter か、外のクリック(フォーカスが外れたとき)で確定、Esc で取り消し。判定は `section-editor-state.ts` の関数
// 渡す名前は、前後の空白を取り除いた、1〜50 文字(コードポイント)。空・空白だけ・変更なしのときは、渡さずに閉じる
// 日本語の変換中の Enter は、確定ではなく、変換の確定なので、無視する
// 文字の大きさ・行の高さ・左右の余白は、`SectionBox` の名前と**同じ(キャンバスの単位の px に、同じ係数 `factor` を掛けたもの。`section-label.ts`)**。
//   この入力欄は、キャンバスの変換の内側に置かれるので、拡大・縮小に合わせて、名前と一緒に大きさが変わる。
//   縮小したときは、`SectionBox` と同じ係数(`titleFactor(scale)`)で拡大されて、名前と同じ、読める大きさを保つ
// `onCommit`(名前を渡す)か `onCancel`(何も渡さない)の、どちらかが、1 回だけ呼ばれる
export function SectionNameEditor({
  initial,
  factor = 1,
  className = '',
  onCommit,
  onCancel,
}: {
  /** いまの名前 */
  initial: string
  /** 名前の係数(`titleFactor(scale)`)。`SectionBox` の名前と同じ値を渡す。省略すると 1 */
  factor?: number
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
      className={`pointer-events-auto size-full outline-2 -outline-offset-2 outline-ink ${className}`}
      style={{
        ...labelTypography(factor),
        paddingLeft: labelInputPadding(factor),
        paddingRight: labelInputPadding(factor),
      }}
    />
  )
}
