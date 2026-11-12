// キャンバスの、ポインタ(マウス・トラックパッド・ペン・タッチ)のドラッグの意味を決める。
// 画面にも api にも触れない純粋関数。Figma と同じ操作感:
//   - 背景を 1 本指(マウスの左ボタン)でドラッグ → 範囲選択
//   - トラックパッドの 2 本指スクロール、ホイールは、ドラッグではなく wheel イベントなので、ここには来ない(`use-pan-zoom` が、パンとズームに使う)
//   - Space を押しながらのドラッグ、マウスの中ボタンのドラッグ → パン(画面を動かす)
//   - 選択できるもの(動かせるもの)の上でドラッグ → 動かす
// トラックパッドの 1 本指の操作は、ブラウザには、マウス(pointerType が 'mouse')として届く。
// タッチ画面は、これまでどおり、背景のドラッグがパン(範囲選択はしない)

/** 押した場所: 背景(何もない所)/ ものの上(カード・メモ)/ セクションの内側の空いた所 */
export type DragTarget = 'background' | 'item' | 'section-interior'

/**
 * ドラッグの意味
 * - 'pan': 画面を動かす
 * - 'marquee': 範囲選択
 * - 'move': 押したものを(選択中なら、選択の全部を)動かす
 * - 'none': 何もしない(右ボタン、「セクション」の道具で描いている間など)
 */
export type DragAction = 'pan' | 'marquee' | 'move' | 'none'

export function decideDragAction(input: {
  /** `PointerEvent.pointerType`。'mouse'(トラックパッドを含む)/ 'pen' / 'touch' */
  pointerType: string
  /** `PointerEvent.button`。0: 左(トラックパッドの 1 本指)/ 1: 中 / 2: 右 */
  button: number
  /** Space を押しているか */
  spaceHeld: boolean
  /** 道具。'section' は、セクションを描く道具(描く層が、ドラッグを受ける) */
  tool: 'select' | 'section'
  target: DragTarget
  /** 押したものを、選べるか。`target` が 'background' のときは見ない */
  movable: boolean
  /**
   * 押したものを、実際に動かせるか。省略すると `movable` と同じ。
   * 選べるが動かせないもの(他の人のメモ)は、マウスでは選び(押した時点)、タッチではパンに譲る
   */
  draggable?: boolean
}): DragAction {
  // 「セクション」の道具で描いている間は、描く層が受ける
  if (input.tool === 'section') return 'none'

  const touch = input.pointerType === 'touch'
  if (!touch) {
    // 中ボタンのドラッグは、どこを押していても、パン
    if (input.button === 1) return 'pan'
    // 右ボタンなど(コンテキストメニュー用)は、何もしない
    if (input.button !== 0) return 'none'
    // Space を押しながらのドラッグは、ものの上でも、パン
    if (input.spaceHeld) return 'pan'
  }

  // タッチは、実際に動かせるものだけを「動かす」にする(選べるが動かせないものは、パンに譲る)
  if (touch) {
    const draggable = input.draggable ?? input.movable
    const onBackground = input.target === 'background' || !input.movable || !draggable
    return onBackground ? 'pan' : 'move'
  }
  // マウス・ペンは、選べるものの上なら、動かせなくても選ぶ(押した時点で選択。移動は、各部品が権限で決める)
  const onBackground = input.target === 'background' || !input.movable
  return onBackground ? 'marquee' : 'move'
}