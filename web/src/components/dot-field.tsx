import { useEffect, useRef } from 'react'

// 格子の大きさで絵を描く背景(ドットマトリクス)。山の稜線 2 枚だけ(空は何も描かない)。
// 四角の大きさ、または記号(. : + # @ など)の濃さで描く。
// canvas に描く。色は文字色(`--color-ink`)から取り、ライト / ダークの切り替えに追従する。
// 「動きを減らす」設定のときは、1 枚だけ描いて止める。画面が見えていないあいだは、描かない
// 1 マスの大きさは、画面の幅で決める。1440px 向け(1 マス 16px)と、2000px 向け(1 マス 22px)。
// 画面の幅が 1720px 以上なら 2000px 向け、それ未満なら 1440px 向け。
// 絵の横幅は、いつも画面の幅いっぱいに伸ばす(両側に隙間を作らない)。左右の端だけ、薄く消える。
// 1000px 未満の狭い画面は、横に 90 マス(1 マスは 9px 以上)
export type Layout = { step: number; designWidth: number }
const PRESET_1440 = { step: 16 }
const PRESET_2000 = { step: 22 }
export function layoutFor(width: number): Layout {
  if (width >= 1720) return { step: PRESET_2000.step, designWidth: width }
  if (width >= 1000) return { step: PRESET_1440.step, designWidth: width }
  return { step: Math.max(9, width / 90), designWidth: width }
}

// 文字で描くときの、薄い順の記号(大きさ 0〜1 を、この並びの添字に割り当てる)
const RAMP = ['.', ':', '-', '=', '+', '*', '#', '%', '@'] as const

const smooth = (a: number, b: number, v: number) => {
  const t = Math.min(1, Math.max(0, (v - a) / (b - a)))
  return t * t * (3 - 2 * t)
}

// 画面の端に向かって、絵を薄く消す倍率(0〜1)。端でぶつっと切れて見えないようにする。
// 左右は 5%、下は 12%、上は 8% の幅で消える(左右は、画面の端まで絵が届くよう、短くしてある)
export function edgeFade(nx: number, ny: number): number {
  return (
    smooth(0, 0.05, nx) *
    smooth(0, 0.05, 1 - nx) *
    smooth(0, 0.12, 1 - ny) *
    smooth(0, 0.08, ny)
  )
}

// 時刻 t(秒)の、点 (nx, ny) の大きさ(0〜1)。nx / ny は 0〜1 の位置
export function dotSize(nx: number, ny: number, t: number): number {
  // 稜線の高さ(上が 0、下が 1)。画面の高さを使うよう、奥は 6 割半、手前は 8 割強あたりに置く
  const far = 0.64 + 0.05 * Math.sin(nx * 6 + t * 0.25) + 0.04 * Math.sin(nx * 15 - t * 0.18)
  const near = 0.82 + 0.04 * Math.sin(nx * 4 + 1 - t * 0.2) + 0.03 * Math.sin(nx * 11 + t * 0.3)
  // 手前の山 > 奥の山 > 空
  if (ny > near) return 0.5 + 0.35 * smooth(near, near + 0.2, ny)
  if (ny > far) return 0.22 + 0.3 * smooth(far, near, ny)
  // 空: 何も描かない
  return 0
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
          const size = dotSize(nx, ny, t) * fade
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
    // 表示モードの切り替え(`<html data-theme>` の変化)にも追従する
    const mo = new MutationObserver(onScheme)
    mo.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] })
    reduce.addEventListener('change', start)
    return () => {
      cancelAnimationFrame(frame)
      ro.disconnect()
      io.disconnect()
      scheme.removeEventListener('change', onScheme)
      mo.disconnect()
      reduce.removeEventListener('change', start)
    }
  }, [shape])

  return <canvas ref={ref} aria-hidden="true" className={className} />
}
