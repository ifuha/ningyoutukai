import { useEffect, useMemo, useRef, useState } from 'react'
import { itemKey, parseKey, reconcileItemSelection } from '#/lib/canvas-selection'
import type { ItemKey } from '#/lib/canvas-selection'
import { isTypingTarget, normalizeTool, toolAfterCreate } from '#/lib/canvas-tool'
import { escapeOwner, isOwnedByFoundation } from '#/lib/escape-priority'
import { resolveBackgroundClick, isInteractiveTarget } from '#/lib/section-selection'
import type { Point, Rect } from '#/lib/section-edit-geometry'
import type { Section } from '#/lib/section'
import type {
  CanvasTool,
  SectionDrawLayerProps,
  SectionEditorProps,
  UseCardDragOptions,
} from '#/lib/section-interaction-types'
import type { SectionActions } from '#/lib/use-section-actions'

// セクションの編集の「つなぎ役」。道具(モード)、選択、リーダーの判定、キャンバスのクリックを持ち、
// 描く層(A)・編集枠(B)・カードのドラッグ(C)に渡す値(受け渡しの型 `section-interaction-types.ts` に合わせた props)を作る。
// 部品(A・B・C)は、ここが返す値を、そのまま渡せば動く:
//   `<SectionDrawLayer {...drawLayerProps} />`、`<SectionEditor {...editorPropsFor(section)} />`、`useCardDrag(cardDragOptions)`
//
// 選択は、カード・セクション・メモの `ItemKey` の集合(Figma と同じ複数選択)。押したときの選択の決め方は、`canvas-selection.ts`。
// 編集枠(B)を出すのは、セクションを 1 つだけ選んでいるとき(複数のときは、それぞれの見た目だけを選んだ状態にする)

const EMPTY_KEYS: ReadonlySet<ItemKey> = new Set()

// 編集のメニュー(色・削除の確認)が開いているか(編集枠 B の DOM から見る)
function isEditorMenuOpen(): boolean {
  if (typeof document === 'undefined') return false
  return (
    document.querySelector(
      '[data-section-menu] [role="menu"], [data-section-menu] [role="alertdialog"]',
    ) !== null
  )
}

export function useSectionInteraction({
  actions,
  canEdit,
  sections,
  scale,
  toCanvas,
  getCardRect,
  selectableKeys = EMPTY_KEYS,
}: {
  actions: SectionActions
  /** 自分がリーダーか(`canEditSections(role)`)。リーダーだけが、置く・選択する・動かす */
  canEdit: boolean
  sections: Section[]
  scale: number
  toCanvas: (client: Point) => Point
  /** カードの、キャンバス座標での矩形(測った実際の大きさ)。見つからなければ null */
  getCardRect: (memberId: string) => Rect | null
  /** いま選べるもののキー(カード・セクション・メモ)。消えたものは、選択から外す */
  selectableKeys?: ReadonlySet<ItemKey>
}) {
  // 道具・選択は、保持している値と、いまの状態(リーダーか・選べるものが残っているか)を突き合わせて使う
  const [toolRaw, setToolRaw] = useState<CanvasTool>('select')
  const [selectedRaw, setSelectedRaw] = useState<Set<ItemKey>>(() => new Set())
  const tool = normalizeTool(toolRaw, canEdit)
  const selected = useMemo(
    () => reconcileItemSelection(selectedRaw, selectableKeys),
    [selectedRaw, selectableKeys],
  )
  // 編集枠を出すのは、セクションを 1 つだけ選んでいるとき。カード・メモを選んでいるとき、複数選んでいるときは null
  const selectedSectionId = useMemo(() => {
    if (!canEdit || selected.size !== 1) return null
    const [key] = selected
    if (!key) return null
    const { kind, id } = parseKey(key)
    if (kind !== 'section') return null
    return sections.some((s) => s.sectionId === id) ? id : null
  }, [canEdit, selected, sections])

  const setTool = (next: CanvasTool) => {
    const normalized = normalizeTool(next, canEdit)
    setToolRaw(normalized)
    // 描く道具に切り替えたら、選択の見た目は消す(描く層が全面を受ける)
    if (normalized === 'section') setSelectedRaw(new Set())
  }
  const setSelection = (next: Set<ItemKey>) => setSelectedRaw(next)
  const selectSection = (sectionId: string) => {
    if (canEdit) setSelectedRaw(new Set([itemKey('section', sectionId)]))
  }
  const clearSelection = () => setSelectedRaw(new Set())

  // ドラッグの最中か(カードのドラッグ・範囲選択・編集枠のドラッグや矢印キーの移動)。Esc の優先順位に使う。
  // イベントの中から最新の値を読むので ref に持つ(再描画は要らない)
  const busy = useRef({ cardDragging: false, marqueeDragging: false, editorDragging: false })
  const setCardDragging = (dragging: boolean) => {
    busy.current.cardDragging = dragging
  }
  const setMarqueeDragging = (dragging: boolean) => {
    busy.current.marqueeDragging = dragging
  }

  // Esc: 1 回で、優先順位がいちばん高い 1 つだけが受ける(`escapeOwner`)。ここで動くのは、
  //   「セクション」の道具なら「選択」へ戻る、何かを選んでいれば選択を外す、の 2 つだけ。
  //   カードのドラッグ・範囲選択・編集枠のドラッグ・名前の入力・メニューは、それぞれの部品が受ける(ここでは、選択を外さない)。
  // キャプチャ段階で受ける: 部品の Esc(バブリング段階)より先に、Esc の前の状態で判断する
  //   (部品が先に動いて状態が変わったあとで、選択まで外れないようにする)
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return
      const owner = escapeOwner({
        tool,
        hasSelection: selected.size > 0,
        typing: isTypingTarget(e.target as { tagName?: string; isContentEditable?: boolean } | null),
        cardDragging: busy.current.cardDragging,
        marqueeDragging: busy.current.marqueeDragging,
        editorDragging: busy.current.editorDragging,
        menuOpen: isEditorMenuOpen(),
      })
      if (!isOwnedByFoundation(owner)) return
      if (owner === 'draw') setToolRaw('select')
      else setSelectedRaw(new Set())
    }
    window.addEventListener('keydown', onKeyDown, true)
    return () => window.removeEventListener('keydown', onKeyDown, true)
  }, [tool, selected])

  // キャンバスのクリック。背景のクリックは、選択を外す(選ぶのは、押した時点。`product-tree` のキャプチャ)。
  // Shift を押しているときは、選択を残す
  const handleCanvasClick = (target: Element | null, canvasPoint: Point, additive = false) => {
    const click = resolveBackgroundClick({
      tool,
      canEdit,
      interactive: isInteractiveTarget(target),
      point: canvasPoint,
      sections,
    })
    if (click.type === 'none') return
    // セクションの上のクリックは、押した時点で選択を決めている(ここでは変えない)
    if (click.type === 'select') return
    if (!additive) setSelectedRaw(new Set())
  }

  // A: セクションを描く層。置いたら、作って(名前と色は既定)、「選択」に戻り、作ったセクションを選ぶ
  const drawLayerProps: SectionDrawLayerProps = {
    active: canEdit && tool === 'section',
    scale,
    toCanvas,
    onCreate: (rect) => {
      void actions.createSection(rect).then((created) => {
        setToolRaw(toolAfterCreate())
        if (created) setSelectedRaw(new Set([itemKey('section', created.sectionId)]))
      })
    },
    onCancel: () => setToolRaw('select'),
  }

  // B: 各セクションの編集枠。`onPreview` は、ドラッグ・矢印キーの移動の途中(四角あり)と終わり(null)を知らせる(Esc の優先順位に使う)
  // 選択は、押した時点で、キャンバスのキャプチャが決める(ここでは変えない。複数選択を、押した 1 つに潰さないため)
  const editorPropsFor = (
    section: Section,
  ): SectionEditorProps & { onPreview: (rect: Rect | null) => void } => ({
    onPreview: (rect) => {
      busy.current.editorDragging = rect !== null
    },
    section,
    selected: section.sectionId === selectedSectionId,
    canEdit,
    scale,
    onSelect: () => {},
    onChange: (rect) => void actions.updateSection(section.sectionId, rect),
    onRename: (name) => void actions.updateSection(section.sectionId, { sectionName: name }),
    onColorChange: (color) => void actions.updateSection(section.sectionId, { color }),
    onDelete: () => {
      void actions.deleteSection(section.sectionId)
      setSelectedRaw(new Set())
    },
  })

  // C: カードのドラッグ。「セクション」の道具で描いているときは、カードを動かさない
  const cardDragOptions: UseCardDragOptions = {
    enabled: canEdit && tool !== 'section',
    scale,
    sections,
    getCardRect,
    // 置いた先で決まった所属(`pickSectionForCard` の結果。どこにも入らなければ null=無所属)を、必ず送る
    onDrop: (memberId, position, sectionId) => void actions.moveMember(memberId, position, sectionId),
  }

  return {
    tool,
    setTool,
    selected,
    hasSelection: selected.size > 0,
    setSelection,
    selectedSectionId,
    selectSection,
    clearSelection,
    handleCanvasClick,
    drawLayerProps,
    editorPropsFor,
    cardDragOptions,
    setCardDragging,
    setMarqueeDragging,
  }
}
