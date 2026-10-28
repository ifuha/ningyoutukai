import { useEffect, useRef } from 'react'

// 格子の大きさで絵を描く背景(ドットマトリクス)。山の稜線 2 枚と、またたく星。
// 四角の大きさ、または記号(. : + # @ など)の濃さで描く。
// canvas に描く。色は文字色(`--color-ink`)から取り、ライト / ダークの切り替えに追従する。
// 「動きを減らす」設定のときは、1 枚だけ描いて止める。画面が見えていないあいだは、描かない
// 絵は、2 つの幅向けに作る。1440px 向け(1 マス 16px)と、2000px 向け(1 マス 22px)。
// 画面の幅が 1720px 以上なら 2000px 向け、それ未満なら 1440px 向けを、中央に置く。
// 絵より画面が広ければ、余った左右は何も描かず、狭ければ、はみ出す左右は薄く消える。
// 1000px 未満の狭い画面だけは、絵の全体が収まるよう、幅に合わせて縮める(横に 90 マス、1 マスは 9px 以上)
export type Layout = { step: number; designWidth: number }
const PRESET_1440: Layout = { step: 16, designWidth: 1440 }
const PRESET_2000: Layout = { step: 22, designWidth: 2000 }
export function layoutFor(width: number): Layout {
  if (width >= 1720) return PRESET_2000
  if (width >= 1000) return PRESET_1440
  return { step: Math.max(9, width / 90), designWidth: width }
}

// 文字で描くときの、薄い順の記号(大きさ 0〜1 を、この並びの添字に割り当てる)
const RAMP = ['.', ':', '-', '=', '+', '*', '#', '%', '@'] as const

function hash(x: number, y: number): number {
  const n = Math.sin(x * 127.1 + y * 311.7) * 43758.5453
  return n - Math.floor(n)
}

const smooth = (a: number, b: number, v: number) => {
  const t = Math.min(1, Math.max(0, (v - a) / (b - a)))
  return t * t * (3 - 2 * t)
}

// 画面の端に向かって、絵を薄く消す倍率(0〜1)。端でぶつっと切れて見えないようにする。
// 左右は 14%、下は 18%、上は 8% の幅で消える
export function edgeFade(nx: number, ny: number): number {
  return (
    smooth(0, 0.14, nx) *
    smooth(0, 0.14, 1 - nx) *
    smooth(0, 0.18, 1 - ny) *
    smooth(0, 0.08, ny)
  )
}

// 時刻 t(秒)の、点 (nx, ny) の大きさ(0〜1)。nx / ny は 0〜1 の位置
export function dotSize(nx: number, ny: number, t: number, gx: number, gy: number): number {
  // 稜線の高さ(上が 0、下が 1)。画面の高さを使うよう、奥は中ほど、手前は 6 割あたりに置く
  const far = 0.4 + 0.09 * Math.sin(nx * 6 + t * 0.25) + 0.05 * Math.sin(nx * 15 - t * 0.18)
  const near = 0.62 + 0.08 * Math.sin(nx * 4 + 1 - t * 0.2) + 0.04 * Math.sin(nx * 11 + t * 0.3)
  // 手前の山 > 奥の山 > 空
  if (ny > near) return 0.5 + 0.35 * smooth(near, near + 0.2, ny)
  if (ny > far) return 0.22 + 0.3 * smooth(far, near, ny)
  // 空: 小さな点と、ときどきまたたく星
  const h = hash(gx, gy)
  if (h > 0.965) return 0.25 + 0.35 * (0.5 + 0.5 * Math.sin(t * 1.5 + h * 60))
  return 0.1
}

export function DotField({
  className,
  shape = 'square',
}: {
  className?: string
  // 'square': 四角の大きさで描く / 'char': 記号の濃さで描く
  shape?: 'square' | 'char'
}) {
  const ref = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    const canvas = ref.current
    const ctx = canvas?.getContext('2d')
    if (!canvas || !ctx) return
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)')
    let color = '#000'
    let paper = '#fff'
    let mono = 'monospace'
    let width = 0
    let height = 0
    let frame = 0
    let last = 0
    let visible = true

    const readColor = () => {
      const style = getComputedStyle(document.documentElement)
      color = style.getPropertyValue('--color-ink').trim() || '#000'
      paper = style.getPropertyValue('--color-surface').trim() || '#fff'
      mono = style.getPropertyValue('--font-mono').trim() || 'monospace'
    }
    const resize = () => {
      const dpr = window.devicePixelRatio || 1
      width = canvas.clientWidth
      height = canvas.clientHeight
      canvas.width = Math.round(width * dpr)
      canvas.height = Math.round(height * dpr)
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    }
    const draw = (t: number) => {
      // 紙の色で塗りつぶす(アプリ共通のドットを隠す)。点は、薄く重ねる
      ctx.globalAlpha = 1
      ctx.fillStyle = paper
      ctx.fillRect(0, 0, width, height)
      // 文字は、四角より細いので、少し濃くする
      const { step: STEP, designWidth } = layoutFor(width)
      const left = (width - designWidth) / 2
      ctx.globalAlpha = shape === 'char' ? 0.3 : 0.16
      ctx.fillStyle = color
      if (shape === 'char') {
        ctx.font = `${STEP}px ${mono}`
        ctx.textAlign = 'center'
        ctx.textBaseline = 'middle'
      }
      const cols = Math.ceil(width / STEP)
      const rows = Math.ceil(height / STEP)
      for (let gy = 0; gy < rows; gy++) {
        for (let gx = 0; gx < cols; gx++) {
          // 絵の中の位置(0〜1)。絵の外は edgeFade が 0 にする
          const nx = (gx * STEP + STEP / 2 - left) / designWidth
          const ny = gy / rows
          const fade = edgeFade(nx, ny)
          if (fade <= 0) continue
          // 星の位置は、絵の中の列で決める(画面の幅が変わっても、同じ星が同じ所に出る)
          const col = Math.round((nx * designWidth) / STEP)
          const size = dotSize(nx, ny, t, col, gy) * fade
          if (shape === 'char') {
            if (size < 0.08) continue
            const glyph = RAMP[Math.min(RAMP.length - 1, Math.floor(size * RAMP.length))]
            ctx.fillText(glyph, gx * STEP + STEP / 2, gy * STEP + STEP / 2)
            continue
          }
          // 四角。格子の中心に置き、大きさが 1 のとき、格子の 9 割の辺になる
          const side = STEP * 0.9 * size
          if (side < 1) continue
          ctx.fillRect(
            gx * STEP + (STEP - side) / 2,
            gy * STEP + (STEP - side) / 2,
            side,
            side,
          )
        }
      }
    }
    // 約 24 コマ/秒。見えていないあいだは止める
    const loop = (now: number) => {
      frame = requestAnimationFrame(loop)
      if (!visible || now - last < 41) return
      last = now
      draw(now / 1000)
    }
    const start = () => {
      cancelAnimationFrame(frame)
      if (reduce.matches) draw(0)
      else frame = requestAnimationFrame(loop)
    }

    readColor()
    resize()
    start()
    const ro = new ResizeObserver(() => {
      resize()
      if (reduce.matches) draw(0)
    })
    ro.observe(canvas)
    const io = new IntersectionObserver(([e]) => {
      visible = Boolean(e?.isIntersecting)
    })
    io.observe(canvas)
    const scheme = window.matchMedia('(prefers-color-scheme: dark)')
    const onScheme = () => {
      readColor()
      if (reduce.matches) draw(0)
    }
    scheme.addEventListener('change', onScheme)
    reduce.addEventListener('change', start)
    return () => {
      cancelAnimationFrame(frame)
      ro.disconnect()
      io.disconnect()
      scheme.removeEventListener('change', onScheme)
      reduce.removeEventListener('change', start)
    }
  }, [shape])

  return <canvas ref={ref} aria-hidden="true" className={className} />
}
