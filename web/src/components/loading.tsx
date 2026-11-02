import type { CSSProperties } from 'react'
import { RAMP } from '#/lib/glyph-ramp'

/**
 * 読み込み中の表示。背景のドットと同じ記号(. : - = + * # @ など)が、1 文字の中で、薄いものから濃いものへ変わっていく
 * (`.loading-glyph` は styles.css)。動きを減らす設定のときは、止めて、中くらいの記号を 1 つ出す。
 * スクリーンリーダーには、文言だけが読まれる(記号は飾り)
 */
export function Loading({ label = '読み込み中', className = '' }: { label?: string; className?: string }) {
  return (
    <p role="status" className={`flex items-center gap-2 text-m opacity-60 ${className}`}>
      <span aria-hidden="true" className="loading-glyph">
        {RAMP.map((glyph, n) => (
          <i key={glyph} style={{ '--n': n } as CSSProperties}>
            {glyph}
          </i>
        ))}
      </span>
      {label}
    </p>
  )
}
