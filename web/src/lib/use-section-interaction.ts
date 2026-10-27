import { useEffect, useRef, useState } from 'react'
import { isTypingTarget, normalizeTool, toolAfterCreate } from '#/lib/canvas-tool'
import { escapeOwner, isOwnedByFoundation } from '#/lib/escape-priority'
import { reconcileSelection, resolveBackgroundClick, isInteractiveTarget } from '#/lib/section-selection'
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
}: {
  actions: SectionActions
  /** 自分がリーダーか(`canEditSections(role)`)。リーダーだけが、置く・選択する・動かす */
  canEdit: boolean
  sections: Section[]
  scale: number
  toCanvas: (client: Point) => Point
  /** カードの、キャンバス座標での矩形(測った実際の大きさ)。見つからなければ null */
  getCardRect: (memberId: string) => Rect | null
}) {
  // 道具・選択は、保持している値と、いまの状態(リーダーか・セクションが残っているか)を突き合わせて使う
  const [toolRaw, setToolRaw] = useState<CanvasTool>('pan') // 初期は「移動」(これまでの、つかむカーソルと同じ見た目)
  const [selectedRaw, setSelectedRaw] = useState<string | null>(null)
  const tool = normalizeTool(toolRaw, canEdit)
  const selectedSectionId = reconcileSelection(selectedRaw, sections, canEdit)

  const setTool = (next: CanvasTool) => setToolRaw(normalizeTool(next, canEdit))
  const selectSection = (sectionId: string) => {
    if (canEdit) setSelectedRaw(sectionId)
  }
  const clearSelection = () => setSelectedRaw(null)

  // ドラッグの最中か(カードのドラッグ・編集枠のドラッグや矢印キーの移動)。Esc の優先順位に使う。
  // イベントの中から最新の値を読むので ref に持つ(再描画は要らない)
  const busy = useRef({ cardDragging: false, editorDragging: false })
  const setCardDragging = (dragging: boolean) => {
    busy.current.cardDragging = dragging
  }

  // Esc: 1 回で、優先順位がいちばん高い 1 つだけが受ける(`escapeOwner`)。ここで動くのは、
  //   「セクション」の道具なら「選択」へ戻る、セクションを選んでいれば選択を外す、の 2 つだけ。
  //   カードのドラッグ・編集枠のドラッグ・名前の入力・メニューは、それぞれの部品が受ける(ここでは、選択を外さない)。
  // キャプチャ段階で受ける: 部品の Esc(バブリング段階)より先に、Esc の前の状態で判断する
  //   (部品が先に動いて状態が変わったあとで、選択まで外れないようにする)
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return
      const owner = escapeOwner({
        tool,
        selectedSectionId,
        typing: isTypingTarget(e.target as { tagName?: string; isContentEditable?: boolean } | null),
        cardDragging: busy.current.cardDragging,
        editorDragging: busy.current.editorDragging,
        menuOpen: isEditorMenuOpen(),
      })
      if (!isOwnedByFoundation(owner)) return
      if (owner === 'draw') setToolRaw('select')
      else setSelectedRaw(null)
    }
    window.addEventListener('keydown', onKeyDown, true)
    return () => window.removeEventListener('keydown', onKeyDown, true)
  }, [tool, selectedSectionId])

  // キャンバスのクリック。クリックした点にあるセクションを選ぶ(重なるときは、小さい方)。どこにもなければ、選択を外す
  const handleCanvasClick = (target: Element | null, canvasPoint: Point) => {
    const click = resolveBackgroundClick({
      tool,
      canEdit,
      interactive: isInteractiveTarget(target),
      point: canvasPoint,
      sections,
    })
    if (click.type === 'select') setSelectedRaw(click.sectionId)
    else if (click.type === 'clear') setSelectedRaw(null)
  }

  // A: セクションを描く層。置いたら、作って(名前と色は既定)、「選択」に戻り、作ったセクションを選ぶ
  const drawLayerProps: SectionDrawLayerProps = {
    active: canEdit && tool === 'section',
    scale,
    toCanvas,
    onCreate: (rect) => {
      void actions.createSection(rect).then((created) => {
        setToolRaw(toolAfterCreate())
        if (created) setSelectedRaw(created.sectionId)
      })
    },
    onCancel: () => setToolRaw('select'),
  }

  // B: 各セクションの編集枠。`onPreview` は、ドラッグ・矢印キーの移動の途中(四角あり)と終わり(null)を知らせる(Esc の優先順位に使う)
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
    onSelect: () => selectSection(section.sectionId),
    onChange: (rect) => void actions.updateSection(section.sectionId, rect),
    onRename: (name) => void actions.updateSection(section.sectionId, { sectionName: name }),
    onColorChange: (color) => void actions.updateSection(section.sectionId, { color }),
    onDelete: () => {
      void actions.deleteSection(section.sectionId)
      setSelectedRaw(null)
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
    selectedSectionId,
    selectSection,
    clearSelection,
    handleCanvasClick,
    drawLayerProps,
    editorPropsFor,
    cardDragOptions,
    setCardDragging,
  }
}
