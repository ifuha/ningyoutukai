import { useEffect, useRef } from 'react'

// 格子の大きさで絵を描く背景(ドットマトリクス)。山の稜線 2 枚と、またたく星。
// 四角の大きさ、または記号(. : + # @ など)の濃さで描く。
// canvas に描く。色は文字色(`--color-ink`)から取り、ライト / ダークの切り替えに追従する。
// 「動きを減らす」設定のときは、1 枚だけ描いて止める。画面が見えていないあいだは、描かない
// 格子の 1 マスの大きさは、画面の幅に合わせる(横に約 COLS マス。広い画面では大きく、狭い画面では小さく)。
// 読めなくなったり重くなったりしないよう、STEP_MIN〜STEP_MAX px に収める
const COLS = 90
const STEP_MIN = 9
const STEP_MAX = 28
export const stepFor = (width: number) =>
  Math.min(STEP_MAX, Math.max(STEP_MIN, width / COLS))

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

// 時刻 t(秒)の、点 (nx, ny) の大きさ(0〜1)。nx / ny は 0〜1 の位置
export function dotSize(nx: number, ny: number, t: number, gx: number, gy: number): number {
  const far = 0.6 + 0.07 * Math.sin(nx * 6 + t * 0.25) + 0.04 * Math.sin(nx * 15 - t * 0.18)
  const near = 0.8 + 0.06 * Math.sin(nx * 4 + 1 - t * 0.2) + 0.03 * Math.sin(nx * 11 + t * 0.3)
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
      const STEP = stepFor(width)
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
          const size = dotSize(gx / cols, gy / rows, t, gx, gy)
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
