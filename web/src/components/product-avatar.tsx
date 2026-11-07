// プロダクトのアイコン(表示だけ)。24×24、角を 4px 丸める(Figma Frame 84)。
// 画像(`src` = api の `avatarUrl`)があれば `<img>`。**なければ、何も入れない**(同じ 24×24 の空きだけを残す。名前の位置が、行ごとにそろうように)。
// 名前(`name`)は、画像の隣に文字で出るので、画像は読み上げない(`alt=""`)
export function ProductAvatar({ src, name: _name }: { src: string | null | undefined; name: string }) {
  if (src) {
    return <img src={src} alt="" className="size-6 shrink-0 rounded-[4px] object-cover" />
  }
  return <span aria-hidden="true" data-avatar-fallback className="size-6 shrink-0" />
}
