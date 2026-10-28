// ドット絵。`rows` の `#` を 1 マスとして、色は文字色(`currentColor`)で塗る。
// 画像ファイルを持たず、文字列の図から描く(縮小しても、にじまない)
export function PixelSprite({
  rows,
  pixel,
  className,
}: {
  rows: readonly string[]
  // 1 マスの大きさ(px)
  pixel: number
  className?: string
}) {
  const width = Math.max(...rows.map((r) => r.length))
  let d = ''
  rows.forEach((row, y) => {
    for (let x = 0; x < row.length; x++) {
      if (row[x] === '#') d += `M${x} ${y}h1v1h-1z`
    }
  })
  return (
    <svg
      aria-hidden="true"
      viewBox={`0 0 ${width} ${rows.length}`}
      width={width * pixel}
      height={rows.length * pixel}
      shapeRendering="crispEdges"
      fill="currentColor"
      className={className}
    >
      <path d={d} />
    </svg>
  )
}

export const puppetSprite = [
  '......####......',
  '.....######.....',
  '.....#.##.#.....',
  '.....######.....',
  '......####......',
  '.......##.......',
  '..############..',
  '.##.########.##.',
  '.##.########.##.',
  '.##.########.##.',
  '.##..######..##.',
  '......####......',
  '......####......',
  '......#..#......',
  '......#..#......',
  '.....##..##.....',
  '.....##..##.....',
  '....###..###....',
] as const

export const starSprite = [
  '...#...',
  '...#...',
  '.#####.',
  '..###..',
  '.##.##.',
  '.#...#.',
] as const

export const heartSprite = [
  '.##.##.',
  '#######',
  '#######',
  '.#####.',
  '..###..',
  '...#...',
] as const
