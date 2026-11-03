/**
 * 見つからなかった URL のパスを、画面に出す形にする(404 ページの `$ cd /パス` の行)。
 * - 検索文字列(`?…`)とハッシュ(`#…`)は、出さない(トークンなどが入っていることがあり、画面に残す必要もない)
 * - 長すぎるパスは、画面からはみ出さないよう、途中で切る
 * - パーセントエンコードされた文字(日本語など)は、読める形に戻す。戻せない壊れたものは、そのまま出す
 * - 制御文字(改行など)は、空白にする(1 行に収める)
 * パスは、React が文字として出す(HTML として解釈されない)ので、ここでは、エスケープはしない
 */
export const MAX_PATH_LENGTH = 60

export function displayPath(rawPath: string): string {
  let path = rawPath.split(/[?#]/, 1)[0] ?? ''
  try {
    path = decodeURIComponent(path)
  } catch {
    // 壊れたエンコード(`%E3%81` など)は、そのまま出す
  }
  // eslint-disable-next-line no-control-regex
  path = path.replace(/[\u0000-\u001f\u007f]+/g, ' ').trim()
  if (path === '') return '/'
  if (!path.startsWith('/')) path = `/${path}`
  return path.length > MAX_PATH_LENGTH ? `${path.slice(0, MAX_PATH_LENGTH - 1)}…` : path
}
