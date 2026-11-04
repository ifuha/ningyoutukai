/** コメントの本文の上限(UTF-16 の長さ)。api の `MAX_BODY_LENGTH` と同じ値 */
export const MAX_MESSAGE_LENGTH = 2000

/** 送る本文。前後の空白を取り除く(api も同じ。途中の空白と改行は保たれる) */
export function normalizeMessageBody(text: string): string {
  return text.trim()
}

/**
 * 送れる本文か。空・空白だけ(全角スペース、タブ、改行を含む)は送れない。
 * 上限は、取り除く前の長さで判定する(api と同じ。前後の空白込みで超えると 422 になる)
 */
export function canSubmitMessage(text: string): boolean {
  return normalizeMessageBody(text) !== '' && text.length <= MAX_MESSAGE_LENGTH
}