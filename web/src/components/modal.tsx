import { useEffect, useRef } from 'react'

// 共通のモーダル(`dialog`)。`open` の間だけ中身を置くので、閉じると入力の状態は消える。
// 余白は中の div 側に持たせ、背景(dialog 自体)を押したときだけ閉じる。見た目は暫定(ターミナル風)
// `size="full"` は、画面いっぱい気味(設定の画面など)。余白と配置は、中身が持つ(中の div は高さいっぱい)
export function Modal({
  open,
  onClose,
  children,
  overflowVisible = false,
  size = 'md',
}: {
  open: boolean
  onClose: () => void
  children: React.ReactNode
  /** 中身が外へはみ出す部品(候補のリストなど)を置くとき。スクロールさせず、はみ出させる */
  overflowVisible?: boolean
  /** 'md': 幅 32rem までの、ふつうのモーダル(既定)。'full': 画面いっぱい気味(スマホ幅は全面、PC 幅は周りに 2rem の余白) */
  size?: 'md' | 'full'
}) {
  const ref = useRef<HTMLDialogElement>(null)
  // 開く直前にフォーカスされていた要素。閉じたら戻す(消えていたら何もしない)
  const returnTo = useRef<HTMLElement | null>(null)

  useEffect(() => {
    const dialog = ref.current
    if (!dialog) return
    if (open && !dialog.open) {
      returnTo.current = document.activeElement as HTMLElement | null
      dialog.showModal()
    }
    if (!open) {
      if (dialog.open) dialog.close()
      if (returnTo.current?.isConnected) returnTo.current.focus()
      returnTo.current = null
    }
  }, [open])

  const sizeClass =
    size === 'full'
      ? 'h-dvh max-h-none w-screen max-w-none overflow-hidden md:h-[calc(100dvh-4rem)] md:w-[calc(100vw-4rem)]'
      : 'max-h-[calc(100dvh-2rem)] w-[min(32rem,calc(100vw-2rem))]'

  return (
    <dialog
      ref={ref}
      onClose={onClose}
      // 外側(背景)を押したら閉じる。dialog 自体が押されたときだけ(余白は中の div 側なので、中身は押しても閉じない)
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose()
      }}
      className={`m-auto ${sizeClass} shadow-box bg-surface text-ink backdrop:bg-black/40 ${overflowVisible ? 'overflow-visible' : ''}`}
    >
      {open && (
        <div className={size === 'full' ? 'h-full' : 'space-y-4 p-6'}>
          {children}
        </div>
      )}
    </dialog>
  )
}