import { useEffect, useRef, useState } from 'react'
import { Check, ImagePlus, X } from 'lucide-react'
import { IconButton } from '#/components/icon-button'
import { Modal } from '#/components/modal'
import { ProductAvatar } from '#/components/product-avatar'
import { AVATAR_ACCEPT, formatFileSize } from '#/lib/product-avatar'

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

// アイコンを変更するモーダル。メニューの「アイコンを変更」を押すと、**まずこのモーダルが開き**、中で画像を選ぶ。
// - 開いた直後(画像を選ぶ前): 画像を選ぶよう促す表示と、いまのアイコン(なければ、何も入れない空き)での、サイドバーでの見え方。「設定する」は、画像を選ぶまで押せない
// - 画像を選んだあと: 大きな表示(選んだ画像そのもの)と、サイドバーで実際に出る小さな表示(18×18 の角丸。名前の左)を並べる。「別の画像を選ぶ」で、選び直せる
// - 選んだ画像が、種類や大きさの条件に合わないときは、`error` に理由を出す(送らない)。送信に失敗したときも、モーダルの中にエラーを出して、開いたままにする(やり直せる)
// - 送信中は、閉じられない。背景を押しても閉じない(うっかり消さない)。Esc と「やめる」では閉じる
export function AvatarPreviewDialog({
  open,
  file,
  currentUrl = null,
  productName,
  pending = false,
  error = null,
  onSelectFile,
  onConfirm,
  onCancel,
}: {
  open: boolean
  /** 選んだ画像(条件に合ったもの)。まだ選んでいない / 合わなかったときは null */
  file: File | null
  /** いま設定されているアイコンの URL(選ぶ前の、サイドバーでの見え方に使う) */
  currentUrl?: string | null
  productName: string
  pending?: boolean
  error?: string | null
  /** ファイル選択で、画像が選ばれたとき(条件の確認は、呼び出し側) */
  onSelectFile: (file: File) => void
  onConfirm: () => void
  onCancel: () => void
}) {
  const inputRef = useRef<HTMLInputElement>(null)
  const url = useObjectUrl(file)
  const shownUrl = url ?? currentUrl
  return (
    <Modal open={open} onClose={() => !pending && onCancel()} closeOnBackdrop={false}>
      <div className="space-y-4">
        <h2 className="text-l font-bold">アイコンを変更</h2>

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
              data-avatar-preview-empty
              className="size-28 shrink-0 rounded-[4px] border border-dashed border-line bg-panel"
            />
          )}
          <div className="min-w-0 space-y-1">
            {file ? (
              <>
                <p className="truncate text-m font-medium">{file.name}</p>
                <p className="text-s opacity-70">
                  {formatFileSize(file.size)}
                  {file.type && ` ・ ${file.type}`}
                </p>
              </>
            ) : (
              <>
                <p className="text-m font-medium">画像を選んでください</p>
                <p className="text-s opacity-70">GIF・PNG・JPEG・WebP、1MB 以下</p>
              </>
            )}
          </div>
        </div>

        <div className="space-y-1">
          <p className="text-s opacity-70">サイドバーでの見え方</p>
          <div data-avatar-preview-row className="relative h-12 w-60 max-w-full bg-side">
            <span className="absolute top-0 left-[3px] flex h-12 items-center">
              <ProductAvatar src={shownUrl} name={productName} />
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

        <input
          ref={inputRef}
          type="file"
          accept={AVATAR_ACCEPT}
          hidden
          tabIndex={-1}
          aria-hidden="true"
          onChange={(e) => {
            const picked = e.target.files?.[0]
            // 同じファイルをもう一度選べるように、選択を空に戻す
            e.target.value = ''
            if (picked) onSelectFile(picked)
          }}
        />

        <div className="flex flex-wrap items-center gap-3">
          <IconButton
            type="button"
            icon={ImagePlus}
            label={file ? '別の画像を選ぶ' : '画像を選ぶ'}
            showLabel
            variant="outline"
            className="bg-panel"
            disabled={pending}
            onClick={() => inputRef.current?.click()}
          />
          <IconButton
            type="button"
            icon={Check}
            label={pending ? '設定中…' : '設定する'}
            showLabel
            variant="solid"
            disabled={pending || !file}
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
    </Modal>
  )
}
