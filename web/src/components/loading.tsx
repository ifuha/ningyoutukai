import type { CSSProperties } from 'react'

/**
 * 読み込み中の表示。小さな点が順に跳ねる(糸で吊られた人形のように)。
 * 動きを減らす設定のときは、止まって薄い点が並ぶだけ(`.loading-dots` は styles.css)。
 * スクリーンリーダーには、文言だけが読まれる(点は飾り)
 */
export function Loading({ label = '読み込み中', className = '' }: { label?: string; className?: string }) {
  return (
    <p role="status" className={`flex items-center gap-2 text-m opacity-60 ${className}`}>
      <span aria-hidden="true" className="loading-dots">
        {[0, 1, 2].map((n) => (
          <i key={n} style={{ '--n': n } as CSSProperties} />
        ))}
      </span>
      {label}
    </p>
  )
}
