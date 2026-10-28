import { useEffect, useRef } from 'react'

// 点の格子の大きさで絵を描く背景(ドットマトリクス)。山の稜線 2 枚、月、またたく星。
// canvas に描く。色は文字色(`--color-ink`)から取り、ライト / ダークの切り替えに追従する。
// 「動きを減らす」設定のときは、1 枚だけ描いて止める。画面が見えていないあいだは、描かない
const STEP = 14

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
  // 月(円の中が大きな点。縁はなだらか)
  const dx = nx - 0.76
  const dy = (ny - 0.26) * 0.6
  const d = Math.sqrt(dx * dx + dy * dy * 1.6)
  const moon = 1 - smooth(0.085, 0.1, d)
  if (moon > 0) return 0.25 + 0.7 * moon
  // 空: 小さな点と、ときどきまたたく星
  const h = hash(gx, gy)
  if (h > 0.965) return 0.25 + 0.35 * (0.5 + 0.5 * Math.sin(t * 1.5 + h * 60))
  return 0.1
}

export function DotField({ className }: { className?: string }) {
  const ref = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    const canvas = ref.current
    const ctx = canvas?.getContext('2d')
    if (!canvas || !ctx) return
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)')
    let color = '#000'
    let paper = '#fff'
    let width = 0
    let height = 0
    let frame = 0
    let last = 0
    let visible = true

    const readColor = () => {
      const style = getComputedStyle(document.documentElement)
      color = style.getPropertyValue('--color-ink').trim() || '#000'
      paper = style.getPropertyValue('--color-surface').trim() || '#fff'
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
      ctx.globalAlpha = 0.5
      ctx.fillStyle = color
      const cols = Math.ceil(width / STEP)
      const rows = Math.ceil(height / STEP)
      for (let gy = 0; gy < rows; gy++) {
        for (let gx = 0; gx < cols; gx++) {
          const size = dotSize(gx / cols, gy / rows, t, gx, gy)
          const r = (STEP / 2) * size
          if (r < 0.4) continue
          ctx.beginPath()
          ctx.arc(gx * STEP + STEP / 2, gy * STEP + STEP / 2, r, 0, Math.PI * 2)
          ctx.fill()
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
  }, [])

  return <canvas ref={ref} aria-hidden="true" className={className} />
}
