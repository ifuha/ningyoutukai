import { useEffect, useState } from 'react'
import { Check, X } from 'lucide-react'
import { IconButton } from '#/components/icon-button'
import { Modal } from '#/components/modal'
import { ProductAvatar } from '#/components/product-avatar'
import { formatFileSize } from '#/lib/product-avatar'

/** 選んだファイルを、画面に出せる URL にする(閉じたら、解放する)。サーバー描画や、ファイルがないときは null */
function useObjectUrl(file: File | null): string | null {
  const [url, setUrl] = useState<string | null>(null)
  useEffect(() => {
    if (!file) {
      setUrl(null)
      return
    }
    const next = URL.createObjectURL(file)
    setUrl(next)
    return () => URL.revokeObjectURL(next)
  }, [file])
  return url
}

// アイコンを変更するときの、プレビューのモーダル。画像を選んだあと、すぐには送らず、ここで見え方を確かめてから「設定する」で送る。
// - 大きな表示(選んだ画像そのもの)と、サイドバーで実際に出る小さな表示(18×18 の角丸。名前の左)を並べる
// - 送信中は、閉じられない。失敗したら、モーダルの中にエラーを出して、開いたままにする(やり直せる)
export function AvatarPreviewDialog({
  file,
  productName,
  pending = false,
  error = null,
  onConfirm,
  onCancel,
}: {
  file: File | null
  productName: string
  pending?: boolean
  error?: string | null
  onConfirm: () => void
  onCancel: () => void
}) {
  const url = useObjectUrl(file)
  return (
    <Modal open={file !== null} onClose={() => !pending && onCancel()} closeOnBackdrop={false}>
      {file && (
        <div className="space-y-4">
          <h2 className="text-l font-bold">アイコンのプレビュー</h2>

          <div className="flex items-center gap-4">
            {url ? (
              <img
                src={url}
                alt="選んだ画像のプレビュー"
                data-avatar-preview-large
                className="size-28 shrink-0 rounded-[4px] border border-line bg-panel object-cover"
              />
            ) : (
              <div
                aria-hidden="true"
                className="size-28 shrink-0 rounded-[4px] border border-line bg-panel"
              />
            )}
            <div className="min-w-0 space-y-1">
              <p className="truncate text-m font-medium">{file.name}</p>
              <p className="text-s opacity-70">
                {formatFileSize(file.size)}
                {file.type && ` ・ ${file.type}`}
              </p>
            </div>
          </div>

          <div className="space-y-1">
            <p className="text-s opacity-70">サイドバーでの見え方</p>
            <div
              data-avatar-preview-row
              className="relative h-12 w-60 max-w-full bg-side"
            >
              <span className="absolute top-0 left-[3px] flex h-12 items-center">
                <ProductAvatar src={url} name={productName} />
              </span>
              <span className="flex h-12 items-center truncate pr-2 pl-[29px] text-l font-medium">
                {productName}
              </span>
            </div>
          </div>

          {error !== null && (
            <p role="alert" className="border-l border-line pl-3 text-m">
              {error}
            </p>
          )}

          <div className="flex flex-wrap items-center gap-3">
            <IconButton
              type="button"
              icon={Check}
              label={pending ? '設定中…' : '設定する'}
              showLabel
              variant="solid"
              disabled={pending}
              onClick={onConfirm}
            />
            <IconButton
              type="button"
              icon={X}
              label="やめる"
              showLabel
              variant="outline"
              className="bg-panel"
              disabled={pending}
              onClick={onCancel}
            />
          </div>
        </div>
      )}
    </Modal>
  )
}
