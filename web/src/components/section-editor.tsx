import { useEffect, useRef, useState } from 'react'
import type { PointerEvent as ReactPointerEvent } from 'react'
import { flushSync } from 'react-dom'
import { SectionEditorMenu } from '#/components/section-editor-menu'
import { SectionNameEditor } from '#/components/section-name-editor'
import { collectFollowers, type FollowRoot } from '#/lib/drag-follow'
import type { DragTarget } from '#/lib/drag-session'
import type { SectionColor } from '#/lib/section'
import type { Point, Rect } from '#/lib/section-edit-geometry'
import type { ConnectorFollower } from '#/lib/connector-follow'
import { createSectionDragController, type SectionDragController } from '#/lib/section-drag-controller'
import {
  NUDGE_SETTLE_MS,
  bandBoxes,
  handleBoxes,
  handleCursor,
  isClick,
  keyAction,
  menuReduce,
  nudgeRect,
  pickColor,
  confirmDelete,
  screenSize,
  settleNudge,
  type DragKind,
  type MenuState,
} from '#/lib/section-editor-state'
import { confirmPanelOffset, labelHitRect, titleFactor } from '#/lib/section-label'
import { sectionStyle } from '#/lib/section-style'

// セクションの編集枠。`SectionBox`(セクションの見た目を描く)の上に重ねる、編集用の層
// 親は、キャンバスの変換された層(パン・ズームの `transform` の内側)で、`SectionBox` と同じ座標系に置く
//
// できること(`canEdit` のときだけ。リーダーのみは、親が `canEdit` で渡す。false のときは、何も描かず、何も受けない)
// - 選択: 枠の線の近く(帯)・札のクリックで `onSelect()`。四角の内側は、ポインタを通す(カードのドラッグ・キャンバスの移動を妨げない)
//   ただし `interiorSelectable` のとき(カードより下の層に置くとき)は、内側のクリックでも選択できる
// - 札・枠の線の近く(帯)は、未選択でも、押した時点で選択し、4px を超えて動かすと移動する(カードと同じ。パンは始めない)
//   四角の内側の空いた場所のドラッグは、カードの下の層の `SectionMoveSurface` が受ける
// - 選択中: 8 つのハンドルで大きさを変える
// - **マウスに追従する**: 押した瞬間から離すまで、window で動きを受ける(速く動かしても、要素の外へ出ても追従する)。
//   移動は、セクションの四角・この編集枠・中のカードを、transform で一緒に動かす(React の状態を経由しない。1 フレームに 1 回)。
//   大きさの変更は、見た目の四角(破線とハンドル)を、1 フレームに 1 回だけ更新する。
//   確定は、ポインタを離したときに 1 回だけ `onChange(rect)`(離した座標で決める)。動かなかったら呼ばない。Esc で取り消し
// - 名前: 札をダブルクリックで、その場で編集(Enter・外のクリックで `onRename`、Esc で取り消し)
// - 削除: 選択中の Delete / Backspace で、確認を開く(確認を挟む)。「⋯」のメニューのボタンは、ユーザーの指示で消した
//   色の変更は、いま、入口が無い(`onColorChange` と色の選択のメニューは、後で別の入口をつけるために残してある。使われていない)
// - 矢印キー: 1px(Shift で 10px)。連打は、待ち時間(350ms)のあとに 1 回にまとめて `onChange`
// 座標は、すべてキャンバスの座標(`offsetX` / `offsetY` は、`SectionBox` と同じ全体のずらし量で、表示の位置にだけ足す)

export type SectionEditorSection = {
  sectionId: string
  sectionName: string
  color: SectionColor
  x: number
  y: number
  width: number
  height: number
}

export type SectionEditorProps = {
  section: SectionEditorSection
  selected: boolean
  canEdit: boolean
  /** キャンバスの拡大率。ドラッグの差分の換算と、ハンドル・帯・メニューの見た目の大きさ(一定)に使う */
  scale: number
  onSelect: () => void
  /** 移動・大きさの変更の確定(ドラッグの終わり、矢印キーのまとめ)。キャンバスの座標 */
  onChange: (rect: Rect) => void
  /** 名前の確定(前後の空白を取り除いた、1〜50 文字) */
  onRename: (name: string) => void
  /** 色の変更。いまは、入口(「⋯」のメニュー)を消したので、呼ばれない。後で別の入口をつけるために残してある */
  onColorChange: (color: SectionColor) => void
  /** 削除の確認で「削除する」を押したとき */
  onDelete: () => void
  /** `SectionBox` と同じ、負の座標があるときの全体のずらし量(表示の位置にだけ足す)。省略は 0 */
  offsetX?: number
  offsetY?: number
  /** 四角の内側のクリックでも選択できる(カードより下の層に置くとき)。省略は false(内側は、ポインタを通す) */
  interiorSelectable?: boolean
  /** ドラッグが確定した(四角あり)・終わった(`null`)、矢印キーの途中を知らせる。Esc の優先順位に使う。動くたびには呼ばない */
  onPreview?: (rect: Rect | null) => void
  /** 移動で、四角・編集枠と一緒に動かす、位置を持つ所属メンバー(api と同じ規則)。省略は、なし */
  followMemberIds?: readonly string[]
  /** 移動で、親子の線(SVG)を、動くカードに追従させる部品を作る。省略は、線を動かさない */
  getConnectors?: () => ConnectorFollower | null
  /** 名前の入力欄を、最初から開いた状態で描く(ダブルクリックしたあとの見た目を、サーバー描画のテストで確かめるため)。省略は false(普通は閉じている) */
  startRenaming?: boolean
}

type Latest = {
  base: Rect
  scale: number
  selected: boolean
  sectionId: string
  followMemberIds?: readonly string[]
  getConnectors?: () => ConnectorFollower | null
  onSelect: () => void
  onChange: (rect: Rect) => void
  onPreview?: (rect: Rect | null) => void
}

export function SectionEditor({
  section,
  selected,
  canEdit,
  scale,
  onSelect,
  onChange,
  onRename,
  onColorChange,
  onDelete,
  offsetX = 0,
  offsetY = 0,
  interiorSelectable = false,
  onPreview,
  followMemberIds,
  getConnectors,
  startRenaming = false,
}: SectionEditorProps) {
  const base: Rect = { x: section.x, y: section.y, width: section.width, height: section.height }

  // イベントの中(古い render の関数)から、最新の値を読むための入れ物
  const latest = useRef<Latest>({
    base,
    scale,
    selected,
    sectionId: section.sectionId,
    followMemberIds,
    getConnectors,
    onSelect,
    onChange,
    onPreview,
  })
  latest.current = {
    base,
    scale,
    selected,
    sectionId: section.sectionId,
    followMemberIds,
    getConnectors,
    onSelect,
    onChange,
    onPreview,
  }

  // 大きさの変更の、見た目の四角(1 フレームに 1 回だけ更新される。移動は、transform で動かすので、ここには入らない)
  const [liveRect, setLiveRect] = useState<Rect | null>(null)
  const [nudge, setNudge] = useState<Rect | null>(null)
  const nudgeRef = useRef<Rect | null>(null)
  const nudgeTimer = useRef<number | undefined>(undefined)
  const [menu, setMenu] = useState<MenuState>('closed')
  const [renaming, setRenaming] = useState(startRenaming)
  // 押した位置(画面の座標)。クリックとドラッグの区別に使う
  const downPoint = useRef<Point | null>(null)

  const preview = (rect: Rect | null) => latest.current.onPreview?.(rect)

  // 移動・大きさの変更のドラッグ(window で受ける)。札・枠の線の近く・ハンドルが、同じ制御部を使う
  const controllerRef = useRef<SectionDragController | null>(null)
  if (controllerRef.current === null) {
    controllerRef.current = createSectionDragController({
      getTarget: () => window as unknown as DragTarget,
      getLock: (cursor) => ({ body: document.body, cursor }),
      getBase: () => latest.current.base,
      getScale: () => latest.current.scale,
      getFollowers: () =>
        collectFollowers(
          document as unknown as FollowRoot,
          latest.current.sectionId,
          latest.current.followMemberIds ?? [],
        ),
      getConnectors: () => latest.current.getConnectors?.() ?? null,
      batch: (fn) => flushSync(fn),
      onCommit: (rect) => latest.current.onChange(rect),
      onPreview: (rect) => latest.current.onPreview?.(rect),
      onLive: setLiveRect,
      onActive: () => {},
    })
  }
  const controller = controllerRef.current

  const clearNudgeTimer = () => {
    window.clearTimeout(nudgeTimer.current)
    nudgeTimer.current = undefined
  }
  // 矢印キーの移動を、待ち時間のあとに 1 回だけ確定する(選択が外れるときにも、残りを確定する)
  const flushNudge = () => {
    clearNudgeTimer()
    const pending = nudgeRef.current
    if (!pending) return
    nudgeRef.current = null
    setNudge(null)
    preview(null)
    const commit = settleNudge(latest.current.base, pending)
    if (commit) latest.current.onChange(commit)
  }
  const cancelNudge = () => {
    clearNudgeTimer()
    nudgeRef.current = null
    setNudge(null)
    preview(null)
  }

  // 選択中のキー操作(Delete・矢印・Esc)。入力欄の中のキーは、取らない
  useEffect(() => {
    if (!canEdit || !selected) return
    const onKeyDown = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null
      const inEditable =
        !!t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT' || t.isContentEditable)
      const action = keyAction({
        key: e.key,
        shiftKey: e.shiftKey,
        ctrlKey: e.ctrlKey,
        metaKey: e.metaKey,
        altKey: e.altKey,
        inEditable,
      })
      if (action === null) return
      if (action.type === 'ask-delete') {
        e.preventDefault()
        setMenu((m) => menuReduce(m, { type: 'ask-delete' }))
      } else if (action.type === 'nudge') {
        if (controller.isActive()) return
        e.preventDefault()
        const next = nudgeRect(nudgeRef.current ?? latest.current.base, action.delta)
        nudgeRef.current = next
        setNudge(next)
        preview(next)
        clearNudgeTimer()
        nudgeTimer.current = window.setTimeout(flushNudge, NUDGE_SETTLE_MS)
      } else {
        // Esc: ドラッグ中 → ドラッグの取り消し(window のキャプチャ段階で、すでに取り消している。ここでは、ほかの動作をしない)。
        //   矢印キーの移動の途中 → 取り消し。メニューが開いている → 閉じる
        if (controller.takeEscape()) {
          // 1 回の Esc で、受けるのは 1 つだけ
        } else if (nudgeRef.current) {
          cancelNudge()
        } else {
          setMenu((m) => (m === 'closed' ? m : menuReduce(m, { type: 'close' })))
        }
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => {
      window.removeEventListener('keydown', onKeyDown)
      flushNudge()
    }
  }, [canEdit, selected])

  // メニューの外を押したら閉じる
  useEffect(() => {
    if (menu === 'closed') return
    const onPointerDown = (e: PointerEvent) => {
      if (e.target instanceof Element && e.target.closest('[data-section-menu]')) return
      setMenu('closed')
    }
    document.addEventListener('pointerdown', onPointerDown)
    return () => document.removeEventListener('pointerdown', onPointerDown)
  }, [menu])

  // 選択が外れたら、メニューも閉じる
  useEffect(() => {
    if (!selected) setMenu('closed')
  }, [selected])

  useEffect(() => clearNudgeTimer, [])

  // リーダーでなくなった・消えたときは、途中のドラッグを捨てる。画面から消えるときは、リスナーを外す
  useEffect(() => {
    if (!canEdit) controller.cancel()
  }, [canEdit, controller])
  useEffect(() => () => controller.dispose(), [controller])

  if (!canEdit) return null

  // 移動中は、`live` は元のまま(四角・編集枠・カードが、transform で動く)。大きさの変更と矢印キーの途中だけ、見た目の四角を使う
  const live = liveRect ?? nudge ?? base
  const moving = liveRect !== null || nudge !== null
  const style = sectionStyle(section.color)
  // 名前をつかむ場所・名前の入力欄(`SectionBox` の文字の位置に合わせる。ドラッグ中の見た目の幅に追従する)
  // 縮小したとき、名前は、係数 `titleFactor(scale)` で拡大されて、読める大きさを保つ(`SectionBox` と同じ係数。つかむ場所・入力欄・確認の位置も同じ係数)
  const factor = titleFactor(scale)
  const tag = labelHitRect(live.width, factor)

  // 移動・大きさの変更のつかみ場所に付ける、ポインタのイベント
  // 押したら、その場でつかむ(カードと同じ)。**未選択でも、押した時点で選択し**、キャンバスの移動(パン)は始めない。
  // 移動は、動きが 4px を超えたらドラッグになる(クリックだけなら、選択するだけ)。大きさの変更(ハンドル)は、すぐ始まる。
  // 動き・離し・取り消しは、押した瞬間から window で受ける(制御部 `section-drag-controller.ts`)ので、要素には、押したところだけを付ける
  const grab = (kind: DragKind) => ({
    onPointerDown: (e: ReactPointerEvent<HTMLElement>) => {
      if (e.button !== 0 || !e.isPrimary) return
      downPoint.current = { x: e.clientX, y: e.clientY }
      e.stopPropagation()
      e.preventDefault()
      flushNudge()
      if (!latest.current.selected) latest.current.onSelect()
      controller.start(kind, e)
    },
    onClick: (e: { clientX: number; clientY: number }) => {
      if (latest.current.selected || !downPoint.current) return
      if (isClick(downPoint.current, { x: e.clientX, y: e.clientY })) latest.current.onSelect()
    },
  })

  const grabCursor = selected ? 'move' : 'pointer'
  const handleSize = screenSize(2, scale)

  return (
    <div
      role="group"
      aria-label={`セクション ${section.sectionName} の編集`}
      data-section-editor={section.sectionId}
      data-selected={selected ? 'true' : undefined}
      className="pointer-events-none absolute isolate"
      style={{
        left: live.x + offsetX,
        top: live.y + offsetY,
        width: live.width,
        height: live.height,
      }}
    >
      {/* ドラッグ・矢印キーの途中の、見た目だけの四角(確定するまで、元の四角はそのまま) */}
      {moving && (
        <div
          aria-hidden="true"
          data-section-preview
          className="absolute inset-0 border-2 border-dashed"
          style={{ borderColor: style.line, backgroundColor: style.fill }}
        />
      )}
      {/* 選択中の印 */}
      {selected && (
        <div
          aria-hidden="true"
          className="absolute inset-0"
          style={{ outline: `${handleSize}px solid var(--color-ink)`, outlineOffset: handleSize }}
        />
      )}

      {/* 内側(カードより下の層に置くときだけ、クリックで選択できる) */}
      {interiorSelectable && (
        <div
          data-section-interior
          className="pointer-events-auto absolute inset-0"
          onPointerDown={(e) => {
            if (e.button === 0) downPoint.current = { x: e.clientX, y: e.clientY }
          }}
          onClick={grab({ type: 'move' }).onClick}
        />
      )}

      {/* 枠の線の近くの、つかめる帯(押すと選択、ドラッグで移動) */}
      {bandBoxes(live, scale).map((b) => (
        <div
          key={b.side}
          data-section-band={b.side}
          {...grab({ type: 'move' })}
          className="pointer-events-auto absolute z-10"
          style={{
            left: b.left,
            top: b.top,
            width: b.width,
            height: b.height,
            cursor: grabCursor,
            touchAction: 'none',
          }}
        />
      ))}

      {/* 名前(枠の上の文字): 押すと選択、ドラッグで移動、ダブルクリックで名前の編集。つかむ場所と入力欄は、`SectionBox` の文字の位置に合わせる */}
      <div
        className="absolute z-20"
        style={{ left: tag.left, top: tag.top, width: tag.width, height: tag.height }}
      >
        {renaming ? (
          <SectionNameEditor
            initial={section.sectionName}
            factor={factor}
            className="bg-surface text-ink"
            onCommit={(name) => {
              setRenaming(false)
              onRename(name)
            }}
            onCancel={() => setRenaming(false)}
          />
        ) : (
          <div
            data-section-tag
            title="ダブルクリックで名前を変更"
            {...grab({ type: 'move' })}
            onDoubleClick={() => setRenaming(true)}
            className="pointer-events-auto size-full"
            style={{ cursor: grabCursor, touchAction: 'none' }}
          />
        )}
      </div>

      {/* 選択中: 8 つのハンドル(見た目の大きさは、拡大率に関わらず一定) */}
      {selected &&
        handleBoxes(live, scale).map((h) => (
          <div
            key={h.handle}
            data-resize-handle={h.handle}
            aria-hidden="true"
            {...grab({ type: 'resize', handle: h.handle })}
            className="pointer-events-auto absolute z-30 border-line bg-surface"
            style={{
              left: h.cx - h.size / 2,
              top: h.cy - h.size / 2,
              width: h.size,
              height: h.size,
              borderStyle: 'solid',
              borderWidth: handleSize,
              cursor: handleCursor(h.handle),
              touchAction: 'none',
            }}
          />
        ))}

      {/* 選択中: 削除の確認(Delete / Backspace で開く)。「⋯」のボタンは無い。色の選択のメニューは、開く入口が無い(使われていない) */}
      {selected && (
        <SectionEditorMenu
          name={section.sectionName}
          color={section.color}
          menu={menu}
          scale={scale}
          offset={confirmPanelOffset(live.width, factor)}
          onPickColor={(chosen) => {
            const r = pickColor(section.color, chosen)
            setMenu(r.menu)
            if (r.color !== null) onColorChange(r.color)
          }}
          onAskDelete={() => setMenu((m) => menuReduce(m, { type: 'ask-delete' }))}
          onCancelDelete={() => setMenu((m) => menuReduce(m, { type: 'cancel-delete' }))}
          onConfirmDelete={() => {
            const r = confirmDelete(menu)
            setMenu(r.menu)
            if (r.remove) onDelete()
          }}
        />
      )}
    </div>
  )
}
