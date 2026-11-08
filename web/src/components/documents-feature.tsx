import { useState } from 'react'
import { PanelResizeHandle } from '#/components/panel-resize-handle'
import { DirectoryPermissionDialog } from '#/components/directory-permission-dialog'
import { DocumentDialog } from '#/components/document-dialog'
import { DocumentsPanel } from '#/components/documents-panel'
import type { DocDirectory } from '#/lib/document-api'
import { PANEL_DEFAULT_PX, loadPanelWidth, savePanelWidth } from '#/lib/panel-width'
import { useDocumentActions } from '#/lib/use-product-documents'

// 文書の機能(右側のツリー + 文書のダイアログ + 権限のダイアログ)をまとめて、プロダクトの画面に置く部品。
// ツリーは、**画面の右側に、浮かせて**出す(広い画面)。スマホ幅では、画面いっぱいの 1 ページとして出す(`md` 未満)。開閉は、親(「管理」メニューの「文書」)が持つ
// 広い画面では、パネルの左の縁を**マウスで掴んで、幅を変えられる**(`PanelResizeHandle`)。幅は覚えておく(次に開くとき、同じ幅)
export function DocumentsFeature({
  productId,
  open,
  isLeader,
  myMemberId,
  onClose,
}: {
  productId: string
  open: boolean
  isLeader: boolean
  myMemberId: string | undefined
  onClose: () => void
}) {
  const [openDocId, setOpenDocId] = useState<string | null>(null)
  // 権限を設定しているディレクトリ(リーダーだけ)
  const [permissionDir, setPermissionDir] = useState<DocDirectory | null>(null)
  const actions = useDocumentActions(productId)
  // パネルの幅(広い画面だけ)。前回の幅を覚えていて、サーバーでの描画では既定の幅
  const [width, setWidth] = useState(() => (typeof window === 'undefined' ? PANEL_DEFAULT_PX : loadPanelWidth()))

  return (
    <>
      {open && (
        // 広い画面は、**浮かせたカード**: 右・下に 12px の余白、上は見出しのボタン(管理・確認待ち)の下を空ける。ほかの浮かぶパネル(検索・ツールバー)と同じ、枠つきの背景。
        // スマホは、画面いっぱいの 1 ページ。ツールバーや検索より手前
        <div
          className="absolute inset-0 z-30 md:inset-auto md:top-16 md:right-3 md:bottom-3 md:w-[var(--docs-width)] md:drop-shadow-xl"
          style={{ ['--docs-width' as string]: `${width}px` }}
          data-documents-panel=""
        >
          <PanelResizeHandle
            width={width}
            onChange={setWidth}
            onCommit={savePanelWidth}
            onReset={() => {
              setWidth(PANEL_DEFAULT_PX)
              savePanelWidth(PANEL_DEFAULT_PX)
            }}
          />
          <DocumentsPanel
            productId={productId}
            isLeader={isLeader}
            myMemberId={myMemberId}
            activeDocumentId={openDocId}
            onClose={onClose}
            onOpenDocument={setOpenDocId}
            onCreateDocument={async (dir, name) => {
              // 名前だけで作る(本文は空)。作ったら文書のダイアログを開く(本文は、そこで書く)
              const created = await actions.createDocument(dir.directoryId, { name, content: '' })
              setOpenDocId(created.documentId)
            }}
            onOpenPermissions={setPermissionDir}
          />
        </div>
      )}
      <DirectoryPermissionDialog productId={productId} directory={permissionDir} onClose={() => setPermissionDir(null)} />
      <DocumentDialog productId={productId} documentId={openDocId} isLeader={isLeader} myMemberId={myMemberId} onClose={() => setOpenDocId(null)} />
    </>
  )
}
