import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import { MemberCard } from '#/components/member-card'
import { CardGhost, DragSlot } from '#/components/member-card-drag'
import { SectionDrawLayer } from '#/components/section-draw-layer'
import { SectionEditor } from '#/components/section-editor'
import { SectionLayer } from '#/components/section-layer'
import { SectionMoveSurface } from '#/components/section-move-surface'
import { SectionNotice } from '#/components/section-notice'
import { TreeConnectors } from '#/components/tree-connectors'
import { TreeToolbar } from '#/components/tree-toolbar'
import { boxToCanvasRect, CanvasViewContext, clientToCanvas } from '#/lib/canvas-view'
import type { CanvasView } from '#/lib/section-interaction-types'
import { cursorClass } from '#/lib/canvas-tool'
import { freezeBeforeCommit } from '#/lib/freeze-on-commit'
import type { Section } from '#/lib/section'
import { NO_SECTION_ACTIONS } from '#/lib/use-section-actions'
import type { SectionActions } from '#/lib/use-section-actions'
import { useSectionInteraction } from '#/lib/use-section-interaction'
import {
  canvasBounds,
  connectorKind,
  hasPosition,
  splitByPosition,
  type Box,
} from '#/lib/tree-layout'
import type {
  ProductTree as ProductTreeData,
  TreeMember,
  TreeTask,
} from '#/lib/tree'
import { useCanvasSize } from '#/lib/use-canvas-size'
import { useCardDrag } from '#/lib/use-card-drag'
import { boxWithin, useCardBoxes } from '#/lib/use-card-boxes'
import { collectConnectorTargets, createConnectorFollower } from '#/lib/connector-follow'
import type { ConnectorFollower } from '#/lib/connector-follow'
import { usePanZoom } from '#/lib/use-pan-zoom'

// セクションがないときに渡す、空の配列(毎回新しい配列を作らない)
const NO_SECTIONS: Section[] = []

// 下に重ねる道具のバー(高さ 56px、下から 12px)の分の余白(px)。全体表示は、この分を避ける
// 通知は、道具のバーと重ならないよう、その上に置く(下から 74px)。右下の倍率の表示は、置かない
// (拡大縮小は、ホイール・ピンチ・キー(+ -)、全体表示は、キー(0))
const BOTTOM_INSET = 70
const ABOVE_TOOLBAR = 'bottom-[74px]'

// リーダーを一番上、その下にメンバーを横に並べる木構造。線は破線(CSS だけ)、矢印は子から親へ向く
// 領域は、親(メイン領域)いっぱいの、自由にパン(移動)とズームができるキャンバス(スクロールバーは出さない)。初期表示は、全体が収まる倍率
// `header`(見出しとボタン群)と操作バー・説明は、キャンバスの上に重ねる(操作できる部分だけ pointer-events を有効にし、あとは入力をキャンバスへ通す)
// 全体表示とフォーカス追従は、見出しの高さ(測る)と操作バーの高さの分を避ける
// 入力は `usePanZoom`(ドラッグ・二本指スクロール・ピンチ・キー)。ページの縦スクロールは、領域の外で行う
// `onEditTask` を渡すと、タスクが押せて、押した人とタスクを渡す(`canOpenTask` があれば、それが true の人のタスクだけ)
// `onShowTasks` を渡すと、「他 N 件」が押せて、その人を渡す(全員向け)
// 下の中央の道具のバー(`TreeToolbar`)。`onOpenMembers` を渡すと(リーダーのみ)「メンバー」が押せて、メンバーの管理を開く
// 道具(モード)は「選択」「セクション」(`useSectionInteraction`)。初期は「選択」。キャンバスのドラッグでの移動は、「セクション」以外ではいつでも動く。
//   「セクション」を選ぶと、キャンバスのカーソルが十字になり、ドラッグでの移動は止まる(描く層が受ける)。Esc か「選択」で戻る
//   `canEditSections`(リーダー)でなければ、「セクション」は押せず、セクションを選択もできない
// 拡大縮小は、ホイール・ピンチ・キー(+ -)、全体表示はキー(0)。右下は倍率(%)の表示だけ(+/- と「全体表示」のボタンと、操作のヒントの文字は置かない)
// 変換された層の中は、`CanvasViewContext` で、拡大率と、画面の座標 → キャンバス座標の変換(`toCanvas`)を使える
// `sectionActions`(`useSectionActions`)は、編集の操作と、失敗の通知。渡さなければ、編集はできない(表示だけ)
// `sections` を渡すと、その座標と大きさで、色つきの四角を、カードの後ろに描く(F1。表示のみ)
//   座標の原点は、自動配置(リーダーを上、メンバーを横に並べる、これまでの配置)の左上。負の座標があれば、全体をずらして収める
// カードの位置(`positionX` / `positionY`): **カードの左上の座標**(中心ではない)。両方の値があるカードだけ、その座標に置く。
//   NULL のカードは、これまでどおり自動配置のまま(一部だけ位置を持っていても、崩れない)
//   位置を持つカードへの親子の線は、測ったカードの実際の位置に合わせて、SVG で描く(自動配置どうしは、これまでの CSS の線)
export function ProductTree({
  header,
  tree,
  sections = NO_SECTIONS,
  onEditTask,
  canOpenTask,
  onShowTasks,
  onOpenMembers,
  canEditSections = false,
  sectionActions = NO_SECTION_ACTIONS,
}: {
  header?: ReactNode
  tree: ProductTreeData
  sections?: Section[]
  onEditTask?: (member: TreeMember, task: TreeTask) => void
  canOpenTask?: (member: TreeMember) => boolean
  onShowTasks?: (member: TreeMember) => void
  onOpenMembers?: () => void
  /** 自分がリーダーか(セクションの作成・大きさの変更・削除・カードの移動ができる) */
  canEditSections?: boolean
  sectionActions?: SectionActions
}) {
  const { leader, members } = tree
  // 位置を持つカード(座標に置く)と、持たないカード(自動配置のまま)に分ける。リーダーも位置を持てる
  const leaderPlaced = hasPosition(leader)
  const { flow: flowMembers, placed: placedMembers } = splitByPosition(members)
  const placedCards = [
    ...(leaderPlaced
      ? [
          {
            member: leader,
            x: leader.positionX as number,
            y: leader.positionY as number,
          },
        ]
      : []),
    ...placedMembers,
  ]
  // セクションと、位置を持つカードが収まる大きさと、負の座標のときのずらし量(なければ、すべて 0 = これまでの大きさ)
  const bounds = canvasBounds({ sections, cards: placedCards })
  const editFor = (m: TreeMember) =>
    onEditTask && (canOpenTask?.(m) ?? true)
      ? (task: TreeTask) => onEditTask(m, task)
      : undefined
  // 自動配置のメンバーの数(横一列の線の端の判定に使う)
  const last = flowMembers.length - 1
  // 親子の線を SVG で描く子(リーダーかメンバーのどちらかが位置を持つ)。なければ、測らない
  const svgMembers = members.filter(
    (m) => connectorKind(leaderPlaced, hasPosition(m)) === 'svg',
  )
  // カードの集まり・位置が変わったら、測り直すためのキー
  const cardsKey = [leader, ...members]
    .map((m) => `${m.productMemberId}:${m.positionX ?? ''}:${m.positionY ?? ''}`)
    .join('|')
  // 上に重ねている見出しの高さ。全体表示で、ツリーがその下に潜らないようにする(初回の描画の前に測る)
  const headerRef = useRef<HTMLDivElement | null>(null)
  const [headerHeight, setHeaderHeight] = useState(0)
  useLayoutEffect(() => {
    const el = headerRef.current
    if (!el) return
    const measure = () => setHeaderHeight(el.offsetHeight)
    measure()
    const observer = new ResizeObserver(measure)
    observer.observe(el)
    return () => observer.disconnect()
  }, [])
  const { containerRef, contentRef, size } = useCanvasSize(
    headerHeight,
    BOTTOM_INSET,
  )
  const { view, freeze, shiftOrigin, handlers } = usePanZoom(containerRef, size)
  // 中身のずらし量(負の座標を表示するための、中身の最小座標から決まる値)が変わったとき、どの要素も画面上の位置が変わらないよう、
  // パンを逆向きに補正する(セクションを左・上へ動かして範囲が変わっても、見ている画面が勝手に動かない)。
  // レイアウトの直後・描画の前に行うので、ちらつかない。楽観更新の取り消しで、ずらし量が元に戻るときも、同じ計算で元の見え方に戻る
  const offsetRef = useRef({ x: bounds.offsetX, y: bounds.offsetY })
  useLayoutEffect(() => {
    const prev = offsetRef.current
    const next = { x: bounds.offsetX, y: bounds.offsetY }
    if (prev.x === next.x && prev.y === next.y) return
    offsetRef.current = next
    shiftOrigin(prev, next)
    // shiftOrigin は、ref と setState だけを使うので、依存に入れなくてよい
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bounds.offsetX, bounds.offsetY])
  // 編集の確定の直前に、いまの見え方を固定する(自動の全体表示が、編集のたびに計算し直されないように)
  const guardedActions = freezeBeforeCommit(sectionActions, freeze)
  const scale = view?.scale ?? 1
  // 画面の座標 → キャンバス座標。中身(変換された層)の左上の画面上の位置は、パンを含んで測れる
  const toCanvas = useCallback(
    (client: { x: number; y: number }) => {
      const el = contentRef.current
      if (!el) return client
      const r = el.getBoundingClientRect()
      return clientToCanvas(client, { x: r.left, y: r.top }, scale, {
        x: bounds.offsetX,
        y: bounds.offsetY,
      })
    },
    [contentRef, scale, bounds.offsetX, bounds.offsetY],
  )
  const canvasView = useMemo<CanvasView>(() => ({ scale, toCanvas }), [scale, toCanvas])
  // カードの実際の位置と大きさ(キャンバス座標)。カードのドラッグが、どのカードでも(自動配置のカードも)測れるようにする
  const getCardRect = useCallback(
    (memberId: string) => {
      const content = contentRef.current
      if (!content) return null
      for (const el of content.querySelectorAll<HTMLElement>('[data-card-id]')) {
        if (el.dataset.cardId === memberId) {
          return boxToCanvasRect(boxWithin(content, el), {
            x: bounds.offsetX,
            y: bounds.offsetY,
          })
        }
      }
      return null
    },
    [contentRef, bounds.offsetX, bounds.offsetY],
  )
  const interaction = useSectionInteraction({
    actions: guardedActions,
    canEdit: canEditSections,
    sections,
    scale,
    toCanvas,
    getCardRect,
  })
  // C: カードのドラッグ(リーダーだけ。「セクション」の道具で描いている間は動かさない)
  // ドラッグ中に、親子の線(SVG)を、動くカードに追従させる。線の元の端点は、描画のたびに ref に入れる(下の `boxes` から)
  const connectorSourceRef = useRef<{
    leaderId: string
    leaderBox: Box
    targets: { id: string; box: Box }[]
  } | null>(null)
  const makeConnectors = useCallback(
    (movingIds: readonly string[]): ConnectorFollower | null => {
      const source = connectorSourceRef.current
      const content = contentRef.current
      if (!source || !content) return null
      const targets = collectConnectorTargets(content, source.targets)
      if (targets.length === 0) return null
      return createConnectorFollower({
        parentId: source.leaderId,
        parent: source.leaderBox,
        targets,
        moving: new Set(movingIds),
      })
    },
    [contentRef],
  )
  const cardDrag = useCardDrag({
    ...interaction.cardDragOptions,
    getConnectors: (memberId) => makeConnectors([memberId]),
  })
  const dragHandlersFor = (memberId: string) =>
    interaction.cardDragOptions.enabled ? cardDrag.getDragHandlers(memberId) : undefined
  // ドラッグの最中かを、Esc の優先順位(土台)に知らせる(ドラッグ中の Esc は、選択を外さず、ドラッグの取り消しだけ)
  const { setCardDragging } = interaction
  useEffect(() => {
    setCardDragging(cardDrag.draggingId !== null)
  }, [cardDrag.draggingId])
  // ドラッグ中のカード(プレビュー位置に、影のカードを描く)
  const ghostMember =
    cardDrag.draggingId !== null
      ? [leader, ...members].find((m) => m.productMemberId === cardDrag.draggingId)
      : undefined
  const mode = interaction.tool
  // セクションを動かすとき、一緒に動く、位置を持つ所属カード(api と同じ規則: 位置を持つ所属メンバーだけ)
  const followIdsFor = (sectionId: string) =>
    placedCards.filter((c) => c.member.sectionId === sectionId).map((c) => c.member.productMemberId)
  // 内側の「動かす面」(カードの下)を出すか。カードのドラッグと同じ条件(リーダーで、「セクション」の道具で描いているときを除く)
  const moveSurfacesOn = interaction.cardDragOptions.enabled
  // 重なるセクションは、面積が小さい方を手前(後に描く)にする(内側のセクションを、先につかめる。クリックでの選択と同じ規則)
  const moveSurfaceSections = useMemo(
    () => [...sections].sort((a, b) => b.width * b.height - a.width * a.height),
    [sections],
  )
  // 「セクション」の道具のときは、ドラッグでの移動を止める(描く層が受ける)。ホイール・ピンチ・キーは、そのまま使える
  const { onPointerDown, onPointerMove, onPointerUp, onPointerCancel, ...otherHandlers } = handlers
  const containerHandlers =
    mode === 'section'
      ? otherHandlers
      : { ...otherHandlers, onPointerDown, onPointerMove, onPointerUp, onPointerCancel }
  // 線を SVG で描くときだけ、カードの実際の位置・高さを測る
  const boxes = useCardBoxes(contentRef, svgMembers.length > 0, cardsKey)
  const leaderBox = boxes?.get(leader.productMemberId)
  const connectorTargets = svgMembers.flatMap((m) => {
    const box = boxes?.get(m.productMemberId)
    return box ? [{ id: m.productMemberId, box }] : []
  })
  connectorSourceRef.current =
    leaderBox && connectorTargets.length > 0
      ? { leaderId: leader.productMemberId, leaderBox, targets: connectorTargets }
      : null

  return (
    <div className="relative h-full w-full">
      <div
        ref={headerRef}
        className="pointer-events-none absolute inset-x-0 top-0 z-10 border-b border-ink/30 bg-surface/80 px-4 py-3"
      >
        {header}
      </div>
      <div
        ref={containerRef}
        role="region"
        aria-label="ツリー(ドラッグか矢印キーで移動、+ と - で拡大縮小、0 で全体表示)"
        tabIndex={0}
        {...containerHandlers}
        onClick={(e) =>
          interaction.handleCanvasClick(
            e.target instanceof Element ? e.target : null,
            toCanvas({ x: e.clientX, y: e.clientY }),
          )
        }
        className={`absolute inset-0 touch-none select-none overflow-clip overscroll-contain focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ink ${cursorClass(mode)}`}
      >
        <div
          ref={contentRef}
          className="absolute top-0 left-0 w-max origin-top-left"
          style={{
            transform: view
              ? `translate(${view.x}px, ${view.y}px) scale(${view.scale})`
              : undefined,
            visibility: view ? 'visible' : 'hidden',
            // セクションが収まる大きさ(なければ指定しない = 自動配置の大きさのまま)
            minWidth: bounds.minWidth || undefined,
            minHeight: bounds.minHeight || undefined,
          }}
        >
          <CanvasViewContext.Provider value={canvasView}>
          {/* セクションの四角は、カードの後ろ(先に描く)。選択中は輪郭、カードのドロップ先は強調 */}
          <SectionLayer
            sections={sections}
            selectedSectionId={interaction.selectedSectionId}
            hoverSectionId={cardDrag.hoverSectionId}
            offsetX={bounds.offsetX}
            offsetY={bounds.offsetY}
            scale={scale}
          />
          {/* 内側の「動かす面」(カードの下)。カードのない空いた場所のドラッグで、セクションを動かす(カードのように)。
              リーダーだけ。面積の大きい順に並べるので、重なるときは、小さい(内側の)セクションが手前になる */}
          {moveSurfacesOn &&
            moveSurfaceSections.map((s) => {
              const e = interaction.editorPropsFor(s)
              return (
                <SectionMoveSurface
                  key={s.sectionId}
                  section={e.section}
                  canEdit={e.canEdit}
                  scale={e.scale}
                  onSelect={e.onSelect}
                  onChange={e.onChange}
                  onPreview={e.onPreview}
                  followMemberIds={followIdsFor(s.sectionId)}
                  getConnectors={() => makeConnectors(followIdsFor(s.sectionId))}
                  offsetX={bounds.offsetX}
                  offsetY={bounds.offsetY}
                />
              )
            })}
          {/* 重ね順(下から): セクションの四角 → 動かす面 → 親子の線 → 自動配置のカード → 位置を持つカード → 編集枠(B) → ドラッグ中のカードの影(C, z-40)
              描く層(A, z-30)は、道具が「セクション」のときだけ全面を覆う。座標は、キャンバス座標に bounds.offsetX / offsetY を足したもの。
              A・B・C に渡す値は、`useSectionInteraction` が作る(リーダーでなければ、すべて無効) */}
          {/* 位置を持つカードへの、実際の位置に合わせた親子の線(SVG)。セクションの上、カードの下 */}
          {leaderBox && connectorTargets.length > 0 && (
            <TreeConnectors parent={leaderBox} targets={connectorTargets} />
          )}
          {/* 自動配置(リーダーを上、メンバーを横に並べる)。位置を持つカードは含めない。負の座標があるときは、その分だけずらす */}
          {/* 動かす面を出すときは、この枠自体はポインタを通す(枠の大きさ=カードの間の空いた場所が、面のドラッグを遮らないように)。
              カードは、`DragSlot` の `pointer-events-auto` で、これまでどおり受ける */}
          <div
            className={`relative flex w-max flex-col items-center ${moveSurfacesOn ? 'pointer-events-none' : ''}`}
            data-flow-layer=""
            style={{
              marginLeft: bounds.offsetX || undefined,
              marginTop: bounds.offsetY || undefined,
            }}
          >
            {!leaderPlaced && (
              <DragSlot
                handlers={dragHandlersFor(leader.productMemberId)}
                dragging={cardDrag.draggingId === leader.productMemberId}
              >
                <MemberCard
                  member={leader}
                  cardId={leader.productMemberId}
                  onEditTask={editFor(leader)}
                  onShowTasks={onShowTasks}
                />
              </DragSlot>
            )}
            {members.length === 0 ? (
              !leaderPlaced && (
                <p className="mt-4 text-m opacity-60"># メンバーは、まだいません</p>
              )
            ) : (
              flowMembers.length > 0 && (
                <>
                  {!leaderPlaced && (
                    <div
                      aria-hidden="true"
                      className="h-6 border-l border-dashed border-ink/50"
                    />
                  )}
                  <ul className="flex">
                    {flowMembers.map((m, i) => (
                      <li
                        key={m.productMemberId}
                        className={`relative px-3 ${leaderPlaced ? '' : 'pt-6'}`}
                      >
                        {/* リーダーが自動配置のときだけ、これまでの CSS の線。リーダーが位置を持つときは、SVG の線 */}
                        {!leaderPlaced && (
                          <span aria-hidden="true">
                            {flowMembers.length > 1 && (
                              <span
                                className={`absolute top-0 h-0 border-t border-dashed border-ink/50 ${
                                  i === 0
                                    ? 'left-1/2 w-1/2'
                                    : i === last
                                      ? 'left-0 w-1/2'
                                      : 'left-0 w-full'
                                }`}
                              />
                            )}
                            {/* 縦線(幅 1px)と三角(幅 10px)は、どちらも left-1/2 に置き、-translate-x-1/2 で、自分の幅の半分だけ左へ戻す。
                              線は [c-0.5, c+0.5]、三角は [c-5, c+5] で、中心はどちらも c(li の中央)になる */}
                            <span className="absolute top-0 left-1/2 h-4 -translate-x-1/2 border-l border-dashed border-ink/50" />
                            <span className="absolute top-4 left-1/2 size-0 -translate-x-1/2 border-x-[5px] border-b-[7px] border-x-transparent border-b-ink/50" />
                          </span>
                        )}
                        <DragSlot
                          handlers={dragHandlersFor(m.productMemberId)}
                          dragging={cardDrag.draggingId === m.productMemberId}
                        >
                          <MemberCard
                            member={m}
                            cardId={m.productMemberId}
                            onEditTask={editFor(m)}
                            onShowTasks={onShowTasks}
                          />
                        </DragSlot>
                      </li>
                    ))}
                  </ul>
                </>
              )
            )}
          </div>
          {/* 位置を持つカード。座標は左上(負の座標のずらし量を足す)。いちばん手前に描く */}
          {placedCards.map(({ member, x, y }) => (
            <div
              key={member.productMemberId}
              className="absolute"
              style={{ left: x + bounds.offsetX, top: y + bounds.offsetY }}
            >
              <DragSlot
                handlers={dragHandlersFor(member.productMemberId)}
                dragging={cardDrag.draggingId === member.productMemberId}
              >
                <MemberCard
                  member={member}
                  cardId={member.productMemberId}
                  onEditTask={editFor(member)}
                  onShowTasks={onShowTasks}
                />
              </DragSlot>
            </div>
          ))}
          {/* ドラッグ中のカード(C)の影。プレビューの位置に描く。元のカードは、薄くして残す */}
          {ghostMember && cardDrag.previewPosition && (
            <CardGhost
              member={ghostMember}
              position={cardDrag.previewPosition}
              offsetX={bounds.offsetX}
              offsetY={bounds.offsetY}
              elementRef={cardDrag.ghostRef}
            />
          )}
          {/* 各セクションの編集枠(B)。選択・大きさの変更・移動・名前・色・削除。リーダーだけ(リーダーでなければ、何も出さない)。
              カードの後(上)に置く: 外枠は pointer-events を通し、つかめる場所(枠の線の近くの帯、札、選択中のハンドル、「⋯」)だけが受けるので、
              内側のカードのドラッグを妨げない。内側のクリックでの選択は、キャンバスのクリック(`handleCanvasClick`)が受ける
              (`interiorSelectable` は、カードより下に置くときだけ使うので、使わない)。
              `data-no-deselect` で包む: 編集枠の中のクリック(札・メニューの余白など)が、「背景のクリック」として選択を外さないようにする。
              `display: contents` なので、配置には影響しない */}
          {canEditSections && (
            <div data-no-deselect className="contents">
              {sections.map((s) => (
                <SectionEditor
                  key={s.sectionId}
                  {...interaction.editorPropsFor(s)}
                  followMemberIds={followIdsFor(s.sectionId)}
                  getConnectors={() => makeConnectors(followIdsFor(s.sectionId))}
                  offsetX={bounds.offsetX}
                  offsetY={bounds.offsetY}
                />
              ))}
            </div>
          )}
          {/* 「セクション」の道具で、キャンバスにドラッグして、セクションを置く層(A)。`active` でなければ、何も出さず、何も奪わない。
              重ね順は z-30(カードとセクションの上、道具のバー(z-10 の外側の層)より下)。リーダーでなければ、`active` は false */}
          <SectionDrawLayer
            {...interaction.drawLayerProps}
            offsetX={bounds.offsetX}
            offsetY={bounds.offsetY}
          />
          </CanvasViewContext.Provider>
        </div>
      </div>
      <div className="absolute bottom-3 left-1/2 z-10 -translate-x-1/2">
        <TreeToolbar
          mode={mode}
          onModeChange={interaction.setTool}
          onOpenMembers={onOpenMembers}
          canEditSections={canEditSections}
        />
      </div>
      {sectionActions.notice && (
        <div className={`absolute left-1/2 ${ABOVE_TOOLBAR} z-20 -translate-x-1/2`}>
          <SectionNotice
            id={sectionActions.notice.id}
            message={sectionActions.notice.message}
            onDismiss={sectionActions.dismissNotice}
          />
        </div>
      )}
    </div>
  )
}
