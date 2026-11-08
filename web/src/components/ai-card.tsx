import { Bot } from "lucide-react";
import { useContext, useEffect, useRef, useState } from "react";
import { formatDateTime } from "#/components/member-card";
import { CanvasViewContext } from "#/lib/canvas-view";
import type { TreeAi } from "#/lib/tree";

// メンバーの AI のカード(ツリー)。AI はメンバーではなく、持ち主が使う道具。仕様は docs/v4.0/overview.md
// - 名前は全員に見える。確認待ちの下書きの数は、持ち主本人にだけ出る(他の人には `pendingCount` が null)
// - `onOpen` を渡すと(持ち主で、確認待ちがあるとき)押せて、確認待ちのタスクの詳細を開く
// - **リーダーだけ**、カードをつかんで動かせる(メンバーのカードと同じ)。位置は、初めの置き場所からのずれ(px)。持ち主のカードに付いて動く
// - リーダーの AI はリーダーのカードの右に、メンバーの AI はそのメンバーのカードの下に、点線でつないで出す(`MemberCard` が置く)

export function aiCardSummary(
  ai: Pick<TreeAi, "pendingCount" | "lastDraftAt">,
): string {
  if (ai.pendingCount !== null && ai.pendingCount > 0)
    return `確認待ち ${ai.pendingCount} 件`;
  return ai.lastDraftAt
    ? `下書き ${formatDateTime(ai.lastDraftAt)}`
    : "下書きなし";
}

export function AiCard({
  ai,
  onOpen,
}: {
  ai: TreeAi;
  onOpen?: (ai: TreeAi) => void;
}) {
  const waiting = ai.pendingCount !== null && ai.pendingCount > 0;
  const body = (
    <>
      <Bot size={16} aria-hidden="true" className="shrink-0" />
      <span className="min-w-0 flex-1">
        <span className="block truncate font-bold" title={ai.name}>
          {ai.name}
        </span>
        <span
          className={`block truncate text-s ${waiting ? "" : "opacity-70"}`}
        >
          {aiCardSummary(ai)}
        </span>
      </span>
    </>
  );
  const className =
    "flex w-[200px] items-center gap-2 shadow-box bg-panel p-2 text-left";
  return onOpen ? (
    <button
      type="button"
      data-ai-card={ai.tokenId}
      onClick={() => onOpen(ai)}
      className={`${className} cursor-pointer focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink`}
    >
      {body}
    </button>
  ) : (
    <article
      data-ai-card={ai.tokenId}
      aria-label={`AI ${ai.name}`}
      className={className}
    >
      {body}
    </article>
  );
}

const MOVE_THRESHOLD = 3;

/** 動かせるカード 1 枚。つかんで動かす間は手元の位置を使い、離したら `onMove` で保存する(終わるまでは手元の位置のまま) */
function MovableAiCard({
  ai,
  side,
  onOpen,
  onMove,
}: {
  ai: TreeAi;
  side: "right" | "bottom";
  onOpen?: (ai: TreeAi) => void;
  onMove?: (
    ai: TreeAi,
    offset: { offsetX: number; offsetY: number },
  ) => Promise<void> | void;
}) {
  // 拡大率(キャンバスの外、たとえばテストでは 1)
  const scale = useContext(CanvasViewContext)?.scale ?? 1;
  const saved = { x: ai.offsetX ?? 0, y: ai.offsetY ?? 0 };
  const [local, setLocal] = useState<{ x: number; y: number } | null>(null);
  const drag = useRef<{
    startX: number;
    startY: number;
    base: { x: number; y: number };
    moved: boolean;
  } | null>(null);
  const justDragged = useRef(false);
  // 保存した位置が変わったら(取り直しが終わった・他の人が動かした)、手元の位置はやめる
  useEffect(() => setLocal(null), [ai.offsetX, ai.offsetY]);
  const at = local ?? saved;

  return (
    <div className={side === "right" ? "flex items-center" : ""}>
      {/* 持ち主のカードとの点線は、カードを動かしても、持ち主の側に残す */}
      {side === "right" && (
        <span
          aria-hidden="true"
          className="w-6 border-t border-dashed border-ink/50"
        />
      )}
      <div
        data-ai-slot=""
        style={{ translate: `${at.x}px ${at.y}px` }}
        className={
          onMove ? "touch-none cursor-grab active:cursor-grabbing" : undefined
        }
        onPointerDown={(e) => {
          // 持ち主のカード(ドラッグで動くカード)や、キャンバスのパンに、渡さない
          e.stopPropagation();
          if (!onMove || e.button !== 0) return;
          e.currentTarget.setPointerCapture(e.pointerId);
          drag.current = {
            startX: e.clientX,
            startY: e.clientY,
            base: at,
            moved: false,
          };
        }}
        onPointerMove={(e) => {
          const d = drag.current;
          if (!d) return;
          const dx = (e.clientX - d.startX) / scale;
          const dy = (e.clientY - d.startY) / scale;
          if (!d.moved && Math.hypot(dx, dy) * scale < MOVE_THRESHOLD) return;
          d.moved = true;
          setLocal({ x: d.base.x + dx, y: d.base.y + dy });
        }}
        onPointerUp={(e) => {
          const d = drag.current;
          drag.current = null;
          if (!d?.moved || !onMove) return;
          justDragged.current = true;
          const next = {
            x: d.base.x + (e.clientX - d.startX) / scale,
            y: d.base.y + (e.clientY - d.startY) / scale,
          };
          setLocal(next);
          void Promise.resolve(
            onMove(ai, {
              offsetX: Math.round(next.x),
              offsetY: Math.round(next.y),
            }),
          ).finally(() => setLocal(null));
        }}
        onPointerCancel={() => {
          drag.current = null;
          setLocal(null);
        }}
        onClickCapture={(e) => {
          // ドラッグのあとの click は、カードを開く操作にしない
          if (justDragged.current) {
            justDragged.current = false;
            e.stopPropagation();
            e.preventDefault();
          }
        }}
        onDragStart={(e) => e.preventDefault()}
      >
        <AiCard ai={ai} onOpen={onOpen} />
      </div>
    </div>
  );
}

/** 持ち主のカードにぶら下げる、AI のカードの並び。リーダーは右、メンバーは下。`onMove` を渡すと(リーダーにだけ)動かせる */
export function AiCards({
  ais,
  side,
  onOpen,
  onMove,
}: {
  ais: TreeAi[];
  side: "right" | "bottom";
  onOpen?: (ai: TreeAi) => void;
  onMove?: (
    ai: TreeAi,
    offset: { offsetX: number; offsetY: number },
  ) => Promise<void> | void;
}) {
  if (ais.length === 0) return null;
  const open = (ai: TreeAi) =>
    ai.pendingTaskIds && ai.pendingTaskIds.length > 0 ? onOpen : undefined;
  return (
    <div
      className={
        side === "right"
          ? "absolute top-3 left-full flex items-start"
          : "absolute top-full left-4 flex flex-col"
      }
    >
      <ul
        className={
          side === "right"
            ? "flex flex-col gap-2"
            : "flex flex-col gap-2 border-l border-dashed border-ink/50 pt-4 pl-4"
        }
      >
        {ais.map((ai) => (
          <li key={ai.tokenId}>
            <MovableAiCard
              ai={ai}
              side={side}
              onOpen={open(ai)}
              onMove={onMove}
            />
          </li>
        ))}
      </ul>
    </div>
  );
}
