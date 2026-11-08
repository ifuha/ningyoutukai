# ningyoutukai-cli

人形使いを、ターミナルから使う CLI。仕様は [docs/v3.0/cli.md](../docs/v3.0/cli.md)。

コマンド名は `pm`(puppet master = 人形使い)。パッケージ名・キーチェーンの項目・設定ディレクトリ・環境変数は、今までどおり `ningyoutukai` のまま(変えると、今のログインが切れるため)。

## 使えるコマンド

| コマンド | 内容 |
| --- | --- |
| `pm login` | ブラウザで承認して、ログインする(トークンは OS のキーチェーンに保存) |
| `pm logout` | この端末のログインを取り消す |
| `pm whoami` | ログイン中のユーザーを出す(`--json` あり) |
| `pm tasks` | 自分に割り振られたタスクの一覧(全プロダクト)。既定は完了以外。`--all` で完了済みも、`--status <状態>` でその状態だけ、`--product <名前 or ID>` でプロダクトを絞る。`--json` あり |
| `pm task <ID>` | タスクの詳細、渡された文書の一覧、メッセージ履歴。ID は `tasks` の ID 列(先頭の一部でもよい)。`--json` あり |
| `pm docs <ID>` | タスクに渡された Markdown(文書)の一覧。`--json` あり |
| `pm doc <ID> <文書>` | 渡された文書の本文(Markdown そのまま)を出す。文書は名前・`ディレクトリ/名前`・ID(先頭の一部でもよい)。`--ver <N>` で前の版 |
| `pm context <ID>` | AI に渡す全体像: タスクの説明、渡された文書の本文、報告のしかたを、Markdown 1 つで出す。`--json` あり |
| `pm report <ID>` | AI の報告の下書きを保存する(**AI 用のトークンで**)。本文は `--file <パス>` か `--stdin`。読んだ文書として、渡された文書すべてのいまの版を控える(`--no-read` で控えない) |
| `pm ai-token create <名前>` | AI 用のトークンを発行する(**人のログインで**)。中身は一度だけ表示。`--days <日数>`(1〜365、既定 90) |
| `pm ai-token list` / `revoke <ID>` | AI 用のトークンの一覧 / 取り消し |

状態は `in_progress`(作業中)/ `reported`(確認待ち)/ `rejected`(差し戻し中)/ `completed`(完了)。

オプション: `--api <URL>`(環境変数 `NINGYOUTUKAI_API_URL`)、`--no-browser`(login)、`-h`、`-v`。
環境変数 `NINGYOUTUKAI_TOKEN` にトークンを入れると、キーチェーンより優先して使う(CI やコンテナ向け)。

## AI に任せる(v4.0)

人(タスクの担当者)が、AI にタスクを任せる流れ。仕様は [docs/v4.0/overview.md](../docs/v4.0/overview.md)。

1. 担当者が、`pm login` したうえで、`pm ai-token create "Claude Code"` で AI 用のトークン(`pmai_…`)を発行する
2. AI を動かす環境に、`export NINGYOUTUKAI_TOKEN=pmai_…` を設定する(`pm login` は要らない)
3. AI が、`pm tasks` で自分(持ち主)のタスクを見て、`pm context <ID>` で説明と渡された文書を読み、作業する
4. 終わったら、結果を Markdown に書いて `pm report <ID> --file report.md` で保存する → **下書き**になる
5. 担当者(人)が、画面で下書きを確認して、完了報告に出すか判断する。AI が自分で完了にはできない

AI 用のトークンでできるのは、持ち主のタスクの一覧、渡された文書の一覧と本文、報告の下書きの保存だけ。プロダクトの変更や、文書の書き込みなどは 403。

## インストール

`pm` は、PATH に入れないと「command not found」になる。使うだけなら **A**(Bun も、このリポジトリも要らない)。開発しているなら B か C。

### A. GitHub Releases からダウンロードする

[Releases](https://github.com/ifuha/ningyoutukai/releases) の `cli-v*` に、環境ごとのバイナリ(`pm-darwin-arm64` / `pm-darwin-x64` / `pm-linux-x64`)と `SHA256SUMS` がある。

```sh
VERSION=0.1.0                                   # Releases の cli-vX.Y.Z の X.Y.Z
OS=$(uname -s | tr '[:upper:]' '[:lower:]')     # darwin / linux
ARCH=$(uname -m); [ "$ARCH" = x86_64 ] && ARCH=x64; [ "$ARCH" = aarch64 ] && ARCH=arm64
mkdir -p ~/.local/bin
curl -fL -o ~/.local/bin/pm "https://github.com/ifuha/ningyoutukai/releases/download/cli-v$VERSION/pm-$OS-$ARCH"
chmod +x ~/.local/bin/pm                        # ~/.local/bin が PATH に入っていること
pm -v
```

- Linux の x64 と、macOS(Apple Silicon・Intel)に対応。Windows は、まだ
- ブラウザでダウンロードした macOS のファイルは、「開発元を確認できない」と止められることがある。`xattr -d com.apple.quarantine pm` で外せる(`curl` でダウンロードしたものは、止められない)
- 壊れていないかは、`SHA256SUMS` と照らす: `shasum -a 256 pm`(Linux は `sha256sum pm`)の値が、`SHA256SUMS` の該当行と同じ
- 接続先は、何も指定しなければ本番。`pm login` だけでよい

### B. 単一バイナリをビルドして、PATH のあるディレクトリに置く

```sh
cd cli
bun install
bun run build                # dist/pm ができる
install -m 755 dist/pm ~/.local/bin/pm   # ~/.local/bin が PATH に入っていること
```

ソースを変えたら、`bun run build` と `install` をやり直す。Bun が入っていない環境でも動く。

以前の名前(`ningyoutukai`)で入れていたら、古いものを消す: `rm ~/.local/bin/ningyoutukai`。ログインは、そのまま引き継がれる。

### C. Bun のグローバルにインストールする(開発向け)

```sh
bun install -g /path/to/ningyoutukai/cli    # このリポジトリの cli/ へのパス
```

- コマンドは `~/.bun/bin/pm` にできる。`~/.bun/bin` が PATH に入っていること(Bun のインストーラが、普通は入れてくれる。入っていなければ `export PATH="$HOME/.bun/bin:$PATH"`)
- ソースへのリンクなので、**リポジトリの場所を動かす・消すと動かなくなる**。ソースの変更は、すぐ反映される
- 消すとき: `bun remove -g ningyoutukai-cli`

## 開発

```sh
cd cli
bun install
bun run start -- whoami      # インストールせずに実行する
bun test                     # テスト
bun run typecheck            # 型検査
```

ローカルの api に向けるとき:

```sh
NINGYOUTUKAI_API_URL=http://localhost:3001 bun run start -- login
```

(開発用の api と web が動いていて、DB に `device_code` のマイグレーションが入っていること。承認ページは web の `/device`)

## よくある詰まりどころ

- **`command not found: pm`** — まだインストールしていないか、PATH に入っていない。上のインストールを行う
- **`pm` が別のコマンドを起動する** — Android の端末では、OS 標準の `pm`(パッケージマネージャ)がある。PATH の順番で、このコマンドが先になるようにするか、別名にして使う
- **`login` とだけ打つと `login:` と出る** — OS 標準の `login` コマンドが動いている。`pm login` と打つ(`Ctrl+C` で抜ける)
- **「キーチェーンを使えませんでした」** — Linux で libsecret(Secret Service)が無い、など。環境変数 `NINGYOUTUKAI_TOKEN` を使う(トークンは、平文のファイルには保存しない)
