import { useEffect, useRef, useState } from 'react'
import { isTypingTarget } from '#/lib/canvas-tool'

// Space を押しているか(Figma と同じく、Space + ドラッグで、ものを動かさずに画面を動かす)。
// - 入力欄・メモの編集中など、文字を打つ要素の上では、押していないものとする(Space は、文字の入力に使う)
// - window が非アクティブになったら、離す(キーアップが届かないため)
// - `ref` は、イベントの中から最新の値を読むため。`held` は、再描画に使う(いまは使っていない)
export function useSpaceHeld() {
  const ref = useRef(false)
  const [held, setHeld] = useState(false)

  useEffect(() => {
    const down = (event: KeyboardEvent) => {
      if (event.code !== 'Space' && event.key !== ' ') return
      if (event.repeat) return
      if (isTypingTarget(event.target as { tagName?: string; isContentEditable?: boolean } | null)) return
      ref.current = true
      setHeld(true)
    }
    const up = (event: KeyboardEvent) => {
      if (event.code !== 'Space' && event.key !== ' ') return
      ref.current = false
      setHeld(false)
    }
    const reset = () => {
      ref.current = false
      setHeld(false)
    }
    window.addEventListener('keydown', down)
    window.addEventListener('keyup', up)
    window.addEventListener('blur', reset)
    return () => {
      window.removeEventListener('keydown', down)
      window.removeEventListener('keyup', up)
      window.removeEventListener('blur', reset)
    }
  }, [])

  return { ref, held }
}
