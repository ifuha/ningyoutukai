import { connectorPath } from '#/lib/tree-layout'
import type { Box } from '#/lib/tree-layout'

// 親(リーダー)から、位置を持つカードなど、実際の位置に合わせて描く親子の線(SVG)
// 線は、親の下の中央から、子の上の中央まで、直角に曲がる破線。矢印は、これまでと同じく、子から親へ向く(上向きの三角)
// 端点は、測ったカードの位置・高さ(`Box`)から決める(経路の計算は `connectorPath`)
// 自動配置どうしの線は、これまでの CSS の線(`product-tree.tsx`)のまま
// 座標は、中身の左上が原点。中身の左上に置いて、はみ出しても描く(overflow: visible)。ポインタは通す(ドラッグはキャンバスの移動)
export function TreeConnectors({
  parent,
  targets,
}: {
  parent: Box
  targets: { id: string; box: Box }[]
}) {
  return (
    <svg
      aria-hidden="true"
      width={1}
      height={1}
      className="pointer-events-none absolute top-0 left-0 overflow-visible text-ink"
    >
      {targets.map(({ id, box }) => {
        const { d, arrow } = connectorPath(parent, box)
        return (
          <g key={id} data-connector-to={id}>
            <path
              d={d}
              fill="none"
              stroke="currentColor"
              strokeOpacity={0.5}
              strokeWidth={1}
              strokeDasharray="4 3"
            />
            <polygon points={arrow} fill="currentColor" fillOpacity={0.5} />
          </g>
        )
      })}
    </svg>
  )
}
