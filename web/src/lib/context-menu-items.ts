// 右クリック(スマホは長押し)のメニュー(`ContextMenu`)の項目
export type ContextMenuItem = {
  label: string
  /** 項目を選んだとき。このあと、メニューは閉じる */
  onSelect: () => void
  /** 右に添える小さな文字(いまの状態など) */
  detail?: string
  /** true の項目は出さない */
  hidden?: boolean
}

/** 出す項目だけにする(`hidden` の項目を除く) */
export function visibleMenuItems(items: ContextMenuItem[]): ContextMenuItem[] {
  return items.filter((item) => !item.hidden)
}
