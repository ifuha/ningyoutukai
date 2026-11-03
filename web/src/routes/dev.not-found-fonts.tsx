import { useState } from 'react'
import { createFileRoute, notFound } from '@tanstack/react-router'
import { ThemeToggle } from '#/components/theme-toggle'

// 404 ページの「404」の書体を、見比べるための確認用ページ(`/dev/not-found-fonts`)。
// 開発サーバー(`import.meta.env.DEV`)でだけ見られる。本番のビルドでは、見つかりません(404)になる。
// 書体は、figlet(ASCII アートの書体)から選んだ 10 種類。いまの 404 ページの書体(ANSI Shadow 風)と見比べるには、http://localhost:3000/no-such-page を、別のタブで開く
export const Route = createFileRoute('/dev/not-found-fonts')({
  beforeLoad: () => {
    if (!import.meta.env.DEV) throw notFound()
  },
  component: DevNotFoundFonts,
})

type Item = { no: number; font: string; note: string; lines: string[]; width: number }

const ITEMS: Item[] = [
  {
    "no": 1,
    "font": "DOS Rebel",
    "note": "太いブロックに、濃淡(░▒▓)の影。レトロで、読みやすい",
    "lines": [
      " █████ █████     █████    █████ █████",
      "░░███ ░░███    ███░░░███ ░░███ ░░███",
      " ░███  ░███ █ ███   ░░███ ░███  ░███ █",
      " ░███████████░███    ░███ ░███████████",
      " ░░░░░░░███░█░███    ░███ ░░░░░░░███░█",
      "       ░███░ ░░███   ███        ░███░",
      "       █████  ░░░█████░         █████",
      "      ░░░░░     ░░░░░░         ░░░░░"
    ],
    "width": 38
  },
  {
    "no": 2,
    "font": "BlurVision ASCII",
    "note": "ブロックに、細かい質感(ぼかし)がある",
    "lines": [
      "░▒▓█▓▒░░▒▓█▓▒░▒▓████████▓▒░▒▓█▓▒░░▒▓█▓▒░",
      "░▒▓█▓▒░░▒▓█▓▒░▒▓█▓▒░░▒▓█▓▒░▒▓█▓▒░░▒▓█▓▒░",
      "░▒▓█▓▒░░▒▓█▓▒░▒▓█▓▒░░▒▓█▓▒░▒▓█▓▒░░▒▓█▓▒░",
      "░▒▓████████▓▒░▒▓█▓▒░░▒▓█▓▒░▒▓████████▓▒░",
      "       ░▒▓█▓▒░▒▓█▓▒░░▒▓█▓▒░      ░▒▓█▓▒░",
      "       ░▒▓█▓▒░▒▓█▓▒░░▒▓█▓▒░      ░▒▓█▓▒░",
      "       ░▒▓█▓▒░▒▓████████▓▒░      ░▒▓█▓▒░"
    ],
    "width": 40
  },
  {
    "no": 3,
    "font": "ANSI Regular",
    "note": "いまと同じ系統の、影なしの平らなブロック",
    "lines": [
      "██   ██  ██████  ██   ██",
      "██   ██ ██  ████ ██   ██",
      "███████ ██ ██ ██ ███████",
      "     ██ ████  ██      ██",
      "     ██  ██████       ██"
    ],
    "width": 24
  },
  {
    "no": 4,
    "font": "Electronic",
    "note": "ブロックの輪郭だけ(中が抜けた、電子的な形)",
    "lines": [
      " ▄         ▄   ▄▄▄▄▄▄▄▄▄   ▄         ▄",
      "▐░▌       ▐░▌ ▐░░░░░░░░░▌ ▐░▌       ▐░▌",
      "▐░▌       ▐░▌▐░█░█▀▀▀▀▀█░▌▐░▌       ▐░▌",
      "▐░▌       ▐░▌▐░▌▐░▌    ▐░▌▐░▌       ▐░▌",
      "▐░█▄▄▄▄▄▄▄█░▌▐░▌ ▐░▌   ▐░▌▐░█▄▄▄▄▄▄▄█░▌",
      "▐░░░░░░░░░░░▌▐░▌  ▐░▌  ▐░▌▐░░░░░░░░░░░▌",
      " ▀▀▀▀▀▀▀▀▀█░▌▐░▌   ▐░▌ ▐░▌ ▀▀▀▀▀▀▀▀▀█░▌",
      "          ▐░▌▐░▌    ▐░▌▐░▌          ▐░▌",
      "          ▐░▌▐░█▄▄▄▄▄█░█░▌          ▐░▌",
      "          ▐░▌ ▐░░░░░░░░░▌           ▐░▌",
      "           ▀   ▀▀▀▀▀▀▀▀▀             ▀"
    ],
    "width": 39
  },
  {
    "no": 5,
    "font": "Blocks",
    "note": "1 文字ずつ、箱(キーボードのキー)に入った形",
    "lines": [
      " .----------------.  .----------------.  .----------------.",
      "| .--------------. || .--------------. || .--------------. |",
      "| |   _    _     | || |     ____     | || |   _    _     | |",
      "| |  | |  | |    | || |   .'    '.   | || |  | |  | |    | |",
      "| |  | |__| |_   | || |  |  .--.  |  | || |  | |__| |_   | |",
      "| |  |____   _|  | || |  | |    | |  | || |  |____   _|  | |",
      "| |      _| |_   | || |  |  `--'  |  | || |      _| |_   | |",
      "| |     |_____|  | || |   '.____.'   | || |     |_____|  | |",
      "| |              | || |              | || |              | |",
      "| '--------------' || '--------------' || '--------------' |",
      " '----------------'  '----------------'  '----------------'"
    ],
    "width": 60
  },
  {
    "no": 6,
    "font": "Impossible",
    "note": "立体(アイソメトリック)の線画",
    "lines": [
      "       _             _            _",
      "   _  /\\ \\         / /\\       _  /\\ \\",
      "  /\\_\\\\ \\ \\       / /  \\     /\\_\\\\ \\ \\",
      " / / / \\ \\ \\     / / /\\ \\   / / / \\ \\ \\",
      "/ / /   \\ \\ \\   / / /\\ \\ \\ / / /   \\ \\ \\",
      "\\ \\ \\____\\ \\ \\ /_/ /  \\ \\ \\\\ \\ \\____\\ \\ \\",
      " \\ \\________\\ \\\\ \\ \\   \\ \\ \\\\ \\________\\ \\",
      "  \\/________/\\ \\\\ \\ \\   \\ \\ \\\\/________/\\ \\",
      "            \\ \\ \\\\ \\ \\___\\ \\ \\         \\ \\ \\",
      "             \\ \\_\\\\ \\/____\\ \\ \\         \\ \\_\\",
      "              \\/_/ \\_________\\/          \\/_/"
    ],
    "width": 45
  },
  {
    "no": 7,
    "font": "Epic",
    "note": "細い線画。すっきり",
    "lines": [
      "    ___    _______     ___",
      "   /   )  (  __   )   /   )",
      "  / /) |  | (  )  |  / /) |",
      " / (_) (_ | | /   | / (_) (_",
      "(____   _)| (/ /) |(____   _)",
      "     ) (  |   / | |     ) (",
      "     | |  |  (__) |     | |",
      "     (_)  (_______)     (_)"
    ],
    "width": 29
  },
  {
    "no": 8,
    "font": "Gradient",
    "note": "記号の濃淡で、グラデーションを作る(背景の記号と合う)",
    "lines": [
      ".....eeeee....eeeeee.......eeeee...",
      "::::@@@@@@:::@@@@@@@@:::::@@@@@@:::",
      "---%%%-%%%---%%%--%%%----%%%-%%%---",
      "++&&&++&&&+++&&&++&&&+++&&&++&&&+++",
      "*|||||||||||*|||**|||**|||||||||||*",
      "!!!!!!!!!!!!=!!!==!!!=!!!!!!!!!!!!=",
      "#######:::###::::::::########:::###",
      "@@@@@@@...@@@@......@@@@@@@@@...@@@"
    ],
    "width": 35
  },
  {
    "no": 9,
    "font": "Big Money-ne",
    "note": "立体の線。装飾的",
    "lines": [
      " /$$   /$$  /$$$$$$  /$$   /$$",
      "| $$  | $$ /$$$_  $$| $$  | $$",
      "| $$  | $$| $$$$\\ $$| $$  | $$",
      "| $$$$$$$$| $$ $$ $$| $$$$$$$$",
      "|_____  $$| $$\\ $$$$|_____  $$",
      "      | $$| $$ \\ $$$      | $$",
      "      | $$|  $$$$$$/      | $$",
      "      |__/ \\______/       |__/"
    ],
    "width": 30
  },
  {
    "no": 10,
    "font": "Doom",
    "note": "定番の、シンプルな線",
    "lines": [
      "   ___ _____    ___",
      "  /   |  _  |  /   |",
      " / /| | |/' | / /| |",
      "/ /_| |  /| |/ /_| |",
      "\\___  \\ |_/ /\\___  |",
      "    |_/\\___/     |_/"
    ],
    "width": 20
  }
]

function DevNotFoundFonts() {
  // 文字の大きさ(px)。書体ごとに、幅(文字数)が違うので、幅を 520px 前後にそろえる倍率も選べる
  const [fit, setFit] = useState(true)
  const [size, setSize] = useState(14)

  return (
    <main className="min-h-screen bg-surface p-6 text-ink sm:p-10">
      <div className="mx-auto max-w-5xl space-y-8">
        <header className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <h1 className="text-l font-bold">404 の書体の候補</h1>
            <p className="mt-1 text-m opacity-70">開発用のページです(本番では、見つかりません)。気に入った番号を教えてください。</p>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <label className="flex items-center gap-2 text-m">
              <input type="checkbox" checked={fit} onChange={(e) => setFit(e.target.checked)} />
              幅をそろえる
            </label>
            <label className="flex items-center gap-2 text-m">
              文字
              <input type="range" min={8} max={24} value={size} onChange={(e) => setSize(Number(e.target.value))} disabled={fit} />
              {fit ? '自動' : `${size}px`}
            </label>
            <ThemeToggle />
          </div>
        </header>

        <ul className="grid gap-5 md:grid-cols-2">
          {ITEMS.map((it) => {
            // 幅をそろえる: 等幅の文字の幅は、文字の大きさの約 0.6 倍。絵の幅が 480px 前後になる大きさ
            const px = fit ? Math.min(20, Math.max(6, Math.floor(480 / (it.width * 0.6)))) : size
            return (
              <li key={it.no} className="border border-line p-4">
                <p className="text-m font-bold">
                  {it.no}. {it.font}
                </p>
                <p className="mt-1 text-s opacity-60">{it.note}</p>
                <div className="mt-3 overflow-x-auto">
                  <pre
                    role="img"
                    aria-label="404"
                    className="w-fit leading-none"
                    style={{ fontSize: px, fontFamily: 'ui-monospace, Menlo, Consolas, "DejaVu Sans Mono", monospace' }}
                  >
                    {it.lines.join('\n')}
                  </pre>
                </div>
                <p className="mt-2 text-s opacity-50">
                  {it.lines.length} 行 × {it.width} 文字・{px}px
                </p>
              </li>
            )
          })}
        </ul>
      </div>
    </main>
  )
}
