// CLI のログイン(デバイスコード)の承認ページ(`/device`)の、画面に依存しない部分。
// コマンドラインツールが出したコード(例: ABCD-EFGH)を受け取り、ログイン中の人が許可・拒否する(docs/v3.0/cli.md)

/** 入力されたコードを整える。英数字だけを大文字にして取り出す(空白・ハイフン・小文字の違いを吸収する) */
export function normalizeUserCode(input: string): string {
  return input.replace(/[^a-zA-Z0-9]/g, '').toUpperCase()
}

/** 表示用に、4 文字ずつハイフンで区切る(8 文字なら `ABCD-EFGH`)。8 文字未満は、そのまま */
export function formatUserCode(code: string): string {
  const c = normalizeUserCode(code)
  return c.length > 4 ? `${c.slice(0, 4)}-${c.slice(4)}` : c
}

/** コードが、送れる形か(コマンドラインツールが出すコードは 8 文字) */
export const USER_CODE_LENGTH = 8
export function isCompleteUserCode(input: string): boolean {
  return normalizeUserCode(input).length === USER_CODE_LENGTH
}

/**
 * api(better-auth)のエラーの `error` コードを、画面に出す日本語にする。
 * better-auth のメッセージは英語なので出さない。知らないコードは、汎用の文にする
 */
export function deviceErrorMessage(code: string | undefined): string {
  switch (code) {
    case 'invalid_request':
      return 'コードが見つかりません。コマンドラインに表示されたコードを、もう一度確認してください'
    case 'expired_token':
      return 'コードの有効期限が切れました。コマンドラインで、もう一度 login を実行してください'
    case 'device_code_already_processed':
      return 'このコードは、すでに使われています。必要なら、もう一度 login を実行してください'
    case 'access_denied':
      return 'このコードは、別のアカウントで確認されています。もう一度 login を実行してください'
    case 'unauthorized':
      return 'ログインが必要です。ログインしてから、もう一度お試しください'
    default:
      return 'うまくいきませんでした。時間をおいて、もう一度お試しください'
  }
}

/** 承認ページの進み具合 */
export type DevicePhase =
  /** コードを入力する前(コードが付いていない URL で開いた) */
  | 'enter-code'
  /** コードを確認している(api に問い合わせ中) */
  | 'checking'
  /** 許可か拒否かを選ぶ */
  | 'confirm'
  /** 許可した */
  | 'approved'
  /** 拒否した */
  | 'denied'
  /** 失敗した(コードの誤り・期限切れなど) */
  | 'error'
