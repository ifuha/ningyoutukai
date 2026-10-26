import { sectionApiErrorKind } from '#/lib/section-api'

// セクションの操作が失敗したときの、画面に出す短い日本語のメッセージ。
// api の `message` は、項目名が英語で出ることがあるので、種類(403 / 404 / 409 / 422 など)ごとの固定の文にする。

/** 座標の上限を超えるので、動かせない(api に送る前に、画面で止めたとき) */
export const OUT_OF_RANGE_MESSAGE = 'これ以上は動かせません(座標の上限です)'

export function sectionErrorMessage(error: unknown): string {
  switch (sectionApiErrorKind(error)) {
    case 'forbidden':
      return 'この操作は、リーダーだけができます'
    case 'not-found':
      return 'セクションまたはメンバーが見つかりません。表示を更新しました'
    case 'name-conflict':
      return '同じ名前のセクションがすでにあります'
    case 'invalid':
      return 'この内容では保存できません'
    case 'network':
      return '通信できませんでした。もう一度お試しください'
    case 'unauthorized':
      return 'ログインが必要です'
    default:
      return 'エラーが発生しました'
  }
}
