// プロダクトのアイコン(画像)の、ブラウザ側の確認と、エラーメッセージ。api の仕様に合わせる(`api/src/lib/avatar.ts`)

/** 選べる画像の種類(ファイル選択の `accept` に渡す) */
export const AVATAR_ACCEPT = 'image/png,image/jpeg,image/gif,image/webp'
/** 画像の大きさの上限(バイト)。ちょうどは OK */
export const AVATAR_MAX_BYTES = 1_048_576

const ALLOWED_MIME = ['image/png', 'image/jpeg', 'image/gif', 'image/webp']
const ALLOWED_EXTENSIONS = ['png', 'jpg', 'jpeg', 'gif', 'webp']

export const AVATAR_TYPE_MESSAGE = '画像は GIF・PNG・JPEG・WebP のいずれかにしてください'
export const AVATAR_SIZE_MESSAGE = '画像は 1MB 以下にしてください'
export const AVATAR_EMPTY_MESSAGE = 'ファイルが空です'

/** 送る前の確認。問題があれば日本語の理由を、なければ null を返す。種類は MIME で見て、MIME が空のときだけ拡張子で補う */
export function validateAvatarFile(file: { name: string; type: string; size: number }): string | null {
  if (file.type !== '') {
    if (!ALLOWED_MIME.includes(file.type.toLowerCase())) return AVATAR_TYPE_MESSAGE
  } else {
    const ext = file.name.split('.').pop()?.toLowerCase() ?? ''
    if (!file.name.includes('.') || !ALLOWED_EXTENSIONS.includes(ext)) return AVATAR_TYPE_MESSAGE
  }
  if (file.size === 0) return AVATAR_EMPTY_MESSAGE
  if (file.size > AVATAR_MAX_BYTES) return AVATAR_SIZE_MESSAGE
  return null
}

/** api のステータスから、画面に出す日本語のメッセージにする(api の文言は使わない) */
export function avatarErrorMessage(status: number): string {
  switch (status) {
    case 0:
      return 'サーバーに接続できませんでした。時間をおいて、もう一度お試しください'
    case 401:
      return 'ログインし直してください'
    case 403:
      return 'アイコンを変更できるのは、プロダクトのリーダーだけです'
    case 404:
      return 'プロダクトが見つかりません'
    case 413:
      return AVATAR_SIZE_MESSAGE
    case 415:
      return AVATAR_TYPE_MESSAGE
    case 422:
      return AVATAR_EMPTY_MESSAGE
    default:
      return 'アイコンを更新できませんでした。時間をおいて、もう一度お試しください'
  }
}
