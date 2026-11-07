import { useEffect, useRef, useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { ProductAvatar } from '#/components/product-avatar'
import { ApiError } from '#/lib/api'
import { eden, edenData } from '#/lib/eden'
import { AVATAR_ACCEPT, avatarErrorMessage, validateAvatarFile } from '#/lib/product-avatar'

// エラーを出しておく時間(ミリ秒)
const ERROR_MS = 5000

// リーダー用のアイコンのボタン。サイドバーのプロダクトの行(`li` は `relative`)の中に置く。
// - アイコンの 18×18 だけが、このボタンのクリックを受ける(そのほかは、下のプロダクトを選ぶボタンに届く)。行の大きさは変えない
// - 押すとファイル選択が開き、選んだ画像を送る。送る前に、種類と大きさを確認する
// - エラーは、行の下に小さく出し(`role="alert"`)、約 5 秒で消える。次の操作でも消える。出ている間だけ、行が伸びる
// 戻り値は、行の中に並べる 2 つの要素(絶対配置のボタンと、流れの中のエラー文)
export function ProductAvatarButton({
  productId,
  name,
  src,
}: {
  productId: string
  name: string
  src: string | null | undefined
}) {
  const queryClient = useQueryClient()
  const inputRef = useRef<HTMLInputElement>(null)
  const [error, setError] = useState<string | null>(null)

  const upload = useMutation({
    // Eden の `file` は `File`(multipart で送られる)
    mutationFn: (file: File) =>
      edenData(eden().api.product({ productId }).avatar.put({ file })),
    onSuccess: () => {
      // `['products']` で始まるキーをすべて取り直す(一覧と、そのプロダクトのデータ・ツリー)
      void queryClient.invalidateQueries({ queryKey: ['products'] })
    },
    onError: (e) => setError(avatarErrorMessage(e instanceof ApiError ? e.status : 0)),
  })

  // エラーは約 5 秒で消す
  useEffect(() => {
    if (error === null) return
    const timer = setTimeout(() => setError(null), ERROR_MS)
    return () => clearTimeout(timer)
  }, [error])

  const busy = upload.isPending

  return (
    <>
      <span className="pointer-events-none absolute top-0 left-[3px] flex h-12 items-center">
        <span className="group/tip pointer-events-auto relative inline-flex">
          <button
            type="button"
            aria-label={`「${name}」のアイコンを変更`}
            aria-busy={busy}
            disabled={busy}
            onClick={() => {
              setError(null)
              inputRef.current?.click()
            }}
            className={`flex size-[18px] cursor-pointer items-center justify-center focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink disabled:cursor-wait ${busy ? 'opacity-50' : ''}`}
          >
            <ProductAvatar src={src} name={name} />
          </button>
          <span
            aria-hidden="true"
            className="pointer-events-none absolute top-full left-0 z-50 mt-1.5 whitespace-nowrap bg-ink px-2 py-1 text-s text-surface opacity-0 transition-opacity duration-100 group-has-[:focus-visible]/tip:opacity-100 group-hover/tip:opacity-100 group-hover/tip:delay-300"
          >
            アイコンを変更
          </span>
        </span>
      </span>
      <input
        ref={inputRef}
        type="file"
        accept={AVATAR_ACCEPT}
        hidden
        tabIndex={-1}
        aria-hidden="true"
        onChange={(e) => {
          const file = e.target.files?.[0]
          // 同じファイルをもう一度選べるように、選択を空に戻す
          e.target.value = ''
          if (!file) return
          const problem = validateAvatarFile(file)
          if (problem) {
            setError(problem)
            return
          }
          setError(null)
          upload.mutate(file)
        }}
      />
      {error !== null && (
        <p role="alert" className="px-2 pb-1 text-s break-words">
          {error}
        </p>
      )}
    </>
  )
}
