import { useEffect, useRef, useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { Check, ImagePlus, Trash2, X } from 'lucide-react'
import { IconButton } from '#/components/icon-button'
import { ProductAvatar } from '#/components/product-avatar'
import { ApiError } from '#/lib/api'
import { eden, edenData } from '#/lib/eden'
import { AVATAR_ACCEPT, avatarErrorMessage, formatFileSize, validateAvatarFile } from '#/lib/product-avatar'

/** 選んだファイルを、画面に出せる URL にする(外すと、解放する)。サーバー描画や、ファイルがないときは null */
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

// 見た目だけの部品(状態は持たない。`AvatarSettings` が状態をつなぐ)。
// - 画像を選ぶ前: 画像を選ぶよう促す表示(大きな表示は破線の枠だけ)と、いまのアイコン(なければ、何も入れない空き)での、サイドバーでの見え方。「設定する」は、画像を選ぶまで押せない
// - 画像を選んだあと: 大きな表示(選んだ画像そのもの)と、サイドバーで実際に出る小さな表示(18×18 の角丸。名前の左)を並べる。「別の画像を選ぶ」で選び直せる。「選んだ画像を取り消す」で、選ぶ前に戻る
// - 送信中は、すべてのボタンが押せない
// - アイコンを削除: いまのアイコンがあるときだけ出す。押すと確認(「アイコンを削除しますか?」→「削除する」/「やめる」)
export function AvatarSettingsView({
  file,
  currentUrl = null,
  productName,
  pending = false,
  error = null,
  confirmingDelete = false,
  onSelectFile,
  onConfirm,
  onClearFile,
  onAskDelete,
  onDelete,
  onCancelDelete,
}: {
  /** 選んだ画像(条件に合ったもの)。まだ選んでいない / 合わなかったときは null */
  file: File | null
  /** いま設定されているアイコンの URL */
  currentUrl?: string | null
  productName: string
  /** 設定(送信)中、または削除中 */
  pending?: boolean
  error?: string | null
  confirmingDelete?: boolean
  /** ファイル選択で、画像が選ばれたとき(条件の確認は、呼び出し側) */
  onSelectFile: (file: File) => void
  onConfirm: () => void
  onClearFile: () => void
  onAskDelete: () => void
  onDelete: () => void
  onCancelDelete: () => void
}) {
  const inputRef = useRef<HTMLInputElement>(null)
  const url = useObjectUrl(file)
  const shownUrl = url ?? currentUrl
  return (
    <div className="space-y-4">
      <div className="flex items-center gap-4">
        {shownUrl ? (
          <img
            src={shownUrl}
            alt={url ? '選んだ画像のプレビュー' : '現在のアイコン'}
            data-avatar-preview-large
            className="size-28 shrink-0 rounded-[4px] bg-panel object-cover shadow-box"
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
          label={pending && !confirmingDelete ? '設定中…' : '設定する'}
          showLabel
          variant="solid"
          disabled={pending || !file}
          onClick={onConfirm}
        />
        {file && (
          <IconButton
            type="button"
            icon={X}
            label="選んだ画像を取り消す"
            showLabel
            variant="outline"
            className="bg-panel"
            disabled={pending}
            onClick={onClearFile}
          />
        )}
      </div>

      {currentUrl && (
        <div className="space-y-2 border-t border-line pt-4">
          {confirmingDelete ? (
            <>
              <p className="text-m">アイコンを削除しますか?</p>
              <div className="flex flex-wrap gap-3">
                <IconButton
                  type="button"
                  icon={Trash2}
                  label="削除する"
                  showLabel
                  variant="outline"
                  className="bg-panel"
                  disabled={pending}
                  onClick={onDelete}
                />
                <IconButton
                  type="button"
                  icon={X}
                  label="やめる"
                  showLabel
                  variant="outline"
                  className="bg-panel"
                  disabled={pending}
                  onClick={onCancelDelete}
                />
              </div>
            </>
          ) : (
            <IconButton
              type="button"
              icon={Trash2}
              label="アイコンを削除"
              showLabel
              variant="outline"
              className="bg-panel"
              disabled={pending}
              onClick={onAskDelete}
            />
          )}
        </div>
      )}
    </div>
  )
}

// プロダクト設定の「アイコン」の中身(モーダルの中の、常設の面)。状態と送信をつなぐ。
// - 画像を選ぶ → ブラウザ側の確認(種類・大きさ。合わなければ、送らずに理由を出す)→ プレビュー →「設定する」で送る(`PUT`)。
//   成功したら `['products']` を取り直し、選んだ画像を空に戻す。失敗したら、エラーを出す(やり直せる)
// - 削除は、2 段階の確認のあと(`DELETE`)。成功したら `['products']` を取り直す。失敗したら、日本語のエラーを出す
export function AvatarSettings({
  productId,
  productName,
  avatarUrl,
}: {
  productId: string
  productName: string
  avatarUrl?: string | null
}) {
  const queryClient = useQueryClient()
  const [file, setFile] = useState<File | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [confirmingDelete, setConfirmingDelete] = useState(false)

  // 成功したら、`['products']` で始まるキーをすべて取り直す(一覧と、そのプロダクトのデータ・ツリー)
  const refresh = () => void queryClient.invalidateQueries({ queryKey: ['products'] })
  const onError = (e: unknown) => setError(avatarErrorMessage(e instanceof ApiError ? e.status : 0))
  const upload = useMutation({
    // Eden の `file` は `File`(multipart で送られる)
    mutationFn: (f: File) => edenData(eden().api.product({ productId }).avatar.put({ file: f })),
    onSuccess: () => {
      setFile(null)
      refresh()
    },
    onError,
  })
  const remove = useMutation({
    mutationFn: () => edenData(eden().api.product({ productId }).avatar.delete()),
    onSuccess: () => {
      setConfirmingDelete(false)
      refresh()
    },
    onError,
  })

  return (
    <AvatarSettingsView
      file={file}
      currentUrl={avatarUrl}
      productName={productName}
      pending={upload.isPending || remove.isPending}
      error={error}
      confirmingDelete={confirmingDelete}
      onSelectFile={(picked) => {
        // 条件に合わなければ、送らずに理由を出す(前に選んだ画像は、外す)
        const problem = validateAvatarFile(picked)
        upload.reset()
        if (problem) {
          setError(problem)
          setFile(null)
          return
        }
        setError(null)
        setFile(picked)
      }}
      onConfirm={() => {
        if (!file) return
        setError(null)
        upload.mutate(file)
      }}
      onClearFile={() => {
        setFile(null)
        setError(null)
        upload.reset()
      }}
      onAskDelete={() => {
        setError(null)
        setConfirmingDelete(true)
      }}
      onDelete={() => {
        setError(null)
        remove.mutate()
      }}
      onCancelDelete={() => {
        setConfirmingDelete(false)
        setError(null)
        remove.reset()
      }}
    />
  )
}
