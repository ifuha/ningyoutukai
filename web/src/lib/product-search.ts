// プロダクトの画面(`/products/$productId`)の検索パラメータ。
// `?manage=product` を付けて開くと、画面が「プロダクト管理」のダイアログを開き、パラメータを消す(サイドバーの行のメニューから使う)
export type ProductSearch = { manage?: 'product' }

/** URL の検索パラメータを検証する。正しい値(`product`)だけ残し、ないとき・不正な値は空にする */
export function parseProductSearch(search: Record<string, unknown>): ProductSearch {
  return search.manage === 'product' ? { manage: 'product' } : {}
}
