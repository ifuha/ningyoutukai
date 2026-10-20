import { useEffect, useRef, useState } from 'react'
import { InviteMemberForm } from '#/components/invite-member-form'

const buttonClass =
  'flex h-9 shrink-0 items-center justify-center border-2 border-outline bg-secondary px-3 text-sm text-outline transition-transform duration-100 hover:-translate-x-0.5 hover:-translate-y-0.5 hover:shadow-[3px_3px_0_0_var(--color-ink)] focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-ink active:translate-x-0 active:translate-y-0 active:shadow-none'

// 「メンバーを招待」のボタンと、押すと開くモーダル(リーダーにだけ出す)。
// フォームは開いている間だけ置くので、閉じると入力と結果の表示は消える。見た目は暫定(ターミナル風)
export function InviteMemberDialog({ productId }: { productId: string }) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDialogElement>(null)

  useEffect(() => {
    const dialog = ref.current
    if (!dialog) return
    if (open && !dialog.open) dialog.showModal()
    if (!open && dialog.open) dialog.close()
  }, [open])

  return (
    <>
      <button type="button" onClick={() => setOpen(true)} className={buttonClass}>
        メンバーを招待
      </button>
      <dialog
        ref={ref}
        onClose={() => setOpen(false)}
        // 外側(背景)を押したら閉じる。dialog 自体が押されたときだけ(中身は押しても閉じない)
        onClick={(e) => {
          if (e.target === e.currentTarget) setOpen(false)
        }}
        className="m-auto w-[min(32rem,calc(100vw-2rem))] border-2 border-ink bg-surface p-6 text-ink backdrop:bg-black/40"
      >
        {open && (
          <div className="space-y-4">
            <InviteMemberForm productId={productId} />
            <button type="button" onClick={() => setOpen(false)} className={buttonClass}>
              閉じる
            </button>
          </div>
        )}
      </dialog>
    </>
  )
}
