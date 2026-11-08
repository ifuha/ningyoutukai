import { useState } from 'react'
import { DocumentDialog } from '#/components/document-dialog'
import { DocumentsPanel } from '#/components/documents-panel'
import { NewDocumentDialog } from '#/components/new-document-dialog'
import type { DocDirectory } from '#/lib/document-api'
import { useDocumentActions } from '#/lib/use-product-documents'

// 文書の機能(右側のツリー + 文書のダイアログ + 文書を追加するダイアログ)をまとめて、プロダクトの画面に置く部品。
// ツリーは、**画面の右側**。スマホ幅では、画面いっぱいの 1 ページとして出す(`md` 未満)。開閉は、親(「管理」メニューの「文書」)が持つ
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
  const [newDocIn, setNewDocIn] = useState<DocDirectory | null>(null)
  const actions = useDocumentActions(productId)

  return (
    <>
      {open && (
        // 右側に固定の幅で出す(広い画面)/ 画面いっぱい(スマホ)。ツールバーや検索より手前
        <div className="absolute inset-0 z-30 md:left-auto md:w-[22rem] md:max-w-[45%]" data-documents-panel="">
          <DocumentsPanel
            productId={productId}
            isLeader={isLeader}
            myMemberId={myMemberId}
            activeDocumentId={openDocId}
            onClose={onClose}
            onOpenDocument={setOpenDocId}
            onAddDocument={setNewDocIn}
          />
        </div>
      )}
      <NewDocumentDialog
        open={newDocIn !== null}
        directoryName={newDocIn?.name ?? ''}
        onClose={() => setNewDocIn(null)}
        onSubmit={async (input) => {
          if (!newDocIn) return
          const created = await actions.createDocument(newDocIn.directoryId, input)
          setNewDocIn(null)
          setOpenDocId(created.documentId)
        }}
      />
      <DocumentDialog productId={productId} documentId={openDocId} isLeader={isLeader} myMemberId={myMemberId} onClose={() => setOpenDocId(null)} />
    </>
  )
}
