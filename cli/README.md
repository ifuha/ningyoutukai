# ningyoutukai-cli

人形使いを、ターミナルから使う CLI。仕様は [docs/v3.0/cli.md](../docs/v3.0/cli.md)。

コマンド名は未定(仮に `ningyoutukai`)。

## 使えるコマンド

| コマンド | 内容 |
| --- | --- |
| `ningyoutukai login` | ブラウザで承認して、ログインする(トークンは OS のキーチェーンに保存) |
| `ningyoutukai logout` | この端末のログインを取り消す |
| `ningyoutukai whoami` | ログイン中のユーザーを出す(`--json` あり) |
| `ningyoutukai tasks` | 自分に割り振られたタスクの一覧(全プロダクト)。既定は完了以外。`--all` で完了済みも、`--status <状態>` でその状態だけ、`--product <名前 or ID>` でプロダクトを絞る。`--json` あり |
| `ningyoutukai task <ID>` | タスクの詳細とメッセージ履歴。ID は `tasks` の ID 列(先頭の一部でもよい)。`--json` あり |

状態は `in_progress`(作業中)/ `reported`(確認待ち)/ `rejected`(差し戻し中)/ `completed`(完了)。

オプション: `--api <URL>`(環境変数 `NINGYOUTUKAI_API_URL`)、`--no-browser`(login)、`-h`、`-v`。
環境変数 `NINGYOUTUKAI_TOKEN` にトークンを入れると、キーチェーンより優先して使う(CI やコンテナ向け)。

## インストール

`ningyoutukai` は、PATH に入れないと「command not found」になる。次のどちらかで入れる。

### A. 単一バイナリをビルドして、PATH のあるディレクトリに置く

```sh
cd cli
bun install
bun run build                # dist/ningyoutukai ができる
install -m 755 dist/ningyoutukai ~/.local/bin/ningyoutukai   # ~/.local/bin が PATH に入っていること
```

ソースを変えたら、`bun run build` と `install` をやり直す。Bun が入っていない環境でも動く。

### B. Bun のグローバルにインストールする(開発向け)

```sh
bun install -g /path/to/ningyoutukai/cli    # このリポジトリの cli/ へのパス
```

- コマンドは `~/.bun/bin/ningyoutukai` にできる。`~/.bun/bin` が PATH に入っていること(Bun のインストーラが、普通は入れてくれる。入っていなければ `export PATH="$HOME/.bun/bin:$PATH"`)
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

- **`command not found: ningyoutukai`** — まだインストールしていないか、PATH に入っていない。上のインストールを行う
- **`login` とだけ打つと `login:` と出る** — OS 標準の `login` コマンドが動いている。`ningyoutukai login` と打つ(`Ctrl+C` で抜ける)
- **「キーチェーンを使えませんでした」** — Linux で libsecret(Secret Service)が無い、など。環境変数 `NINGYOUTUKAI_TOKEN` を使う(トークンは、平文のファイルには保存しない)
