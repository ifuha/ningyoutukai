import { useEffect, useId, useRef } from 'react'
import { ResizeBox } from '#/components/resize-box'

// 共通のモーダル(`dialog`)。`open` の間だけ中身を置くので、閉じると入力の状態は消える。
// 余白は中の div 側に持たせ、背景(dialog 自体)を押したときだけ閉じる。見た目は暫定(ターミナル風)
// `size="lg"` は、幅 56rem までの広いモーダル(タスクの詳細など、情報が多いもの)。`size="full"` は、画面いっぱい気味(設定の画面など)。余白と配置は、中身が持つ(中の div は高さいっぱい)
export function Modal({
  open,
  onClose,
  children,
  overflowVisible = false,
  size = 'md',
  closeOnBackdrop = true,
  animateResize = false,
  padded = true,
}: {
  open: boolean
  onClose: () => void
  children: React.ReactNode
  /** 中身が外へはみ出す部品(候補のリストなど)を置くとき。スクロールさせず、はみ出させる */
  overflowVisible?: boolean
  /** 'md': 幅 32rem までの、ふつうのモーダル(既定)。'full': 画面いっぱい気味(スマホ幅は全面、PC 幅は周りに 2rem の余白) */
  size?: 'md' | 'lg' | 'full'
  /** 背景(外側)を押したときに閉じるか。入力の途中で、うっかり押して内容が消えるのを避けたいフォームでは false(Esc と「閉じる」では閉じられる) */
  closeOnBackdrop?: boolean
  /** 中身の高さが変わったとき(詳細を開くなど)、モーダルの高さを、なめらかに動かす(`ResizeBox`)。`size="md"` のとき。`overflowVisible` とは、一緒に使わない(動いている間、はみ出しを隠すため) */
  animateResize?: boolean
  /** 外枠の余白(p-3)をつけるか。false は、中身が余白を持つ(小さな確認など) */
  padded?: boolean
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

  // ダイアログに名前を付ける: 中の最初の見出し(h1 / h2)を、`aria-labelledby` で指す(スクリーンリーダーが、開いたときに見出しを読み上げる)
  const titleId = useId()
  useEffect(() => {
    const dialog = ref.current
    if (!open || !dialog) return
    const heading = dialog.querySelector('h1, h2')
    if (!heading) return
    if (!heading.id) heading.id = titleId
    dialog.setAttribute('aria-labelledby', heading.id)
    return () => dialog.removeAttribute('aria-labelledby')
  }, [open, titleId, children])

  const sizeClass =
    size === 'full'
      ? 'h-dvh max-h-none w-screen max-w-none overflow-hidden md:h-[calc(100dvh-4rem)] md:w-[calc(100vw-4rem)]'
      : `max-h-[calc(100dvh-2rem)] ${size === 'lg' ? 'w-[min(56rem,calc(100vw-2rem))]' : 'w-[min(32rem,calc(100vw-2rem))]'}`

  return (
    <dialog
      ref={ref}
      // 自分が閉じたときだけ、閉じたと知らせる。中に重ねたモーダル(確認など)が閉じたときの知らせは、React では親にも届くので、無視する
      // (無視しないと、確認の「やめる」で、このモーダルごと閉じる)
      onClose={(e) => {
        if (e.target === e.currentTarget) onClose()
      }}
      // 外側(背景)を押したら閉じる。dialog 自体が押されたときだけ(余白は中の div 側なので、中身は押しても閉じない)
      onClick={(e) => {
        if (closeOnBackdrop && e.target === e.currentTarget) onClose()
      }}
      className={`m-auto ${sizeClass} rounded-sm shadow-box bg-panel text-ink backdrop:bg-black/40 ${overflowVisible ? 'overflow-visible' : ''}`}
    >
      {open && (
        <div className={size === 'full' ? 'h-full' : padded ? 'space-y-4 p-3' : ''}>
          {animateResize && size !== 'full' && !overflowVisible ? <ResizeBox>{children}</ResizeBox> : children}
        </div>
      )}
    </dialog>
  )
}