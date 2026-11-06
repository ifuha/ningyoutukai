import { Box } from 'lucide-react'

// プロダクトのアイコン(表示だけ)。18×18、角を 4px 丸める(Figma Frame 84)。
// 画像(`src` = api の `avatarUrl`)があれば `<img>`、なければ代わりに立方体のアイコンを、同じ四角の中央に出す。
// 名前(`name`)は、画像の隣に文字で出るので、画像は読み上げない(`alt=""`)
export function ProductAvatar({ src, name: _name }: { src: string | null | undefined; name: string }) {
  if (src) {
    return <img src={src} alt="" className="size-[18px] shrink-0 rounded-[4px] object-cover" />
  }
  return (
    <span
      aria-hidden="true"
      data-avatar-fallback
      className="flex size-[18px] shrink-0 items-center justify-center rounded-[4px] text-ink/60"
    >
      <Box size={16} />
    </span>
  )
}
