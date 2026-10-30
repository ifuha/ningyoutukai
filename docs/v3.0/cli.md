# v3.0 CLI(ターミナルから API を使う)

状態: **案(レビュー待ち)**。実装はこの文書の承認後に始める。

## 1. 目的と範囲

ターミナルから、人形使いの API を使えるようにする。v3.0 の最初の段階は、次の 2 つ。

1. **認証**: `login` コマンドでログインし、以降のコマンドで API を呼べるようにする(`logout`・`whoami` を含む)
2. **自分に割り振られたタスクの取得**: プロダクトをまたいで、自分のタスクを一覧・詳細で見る

この段階では、**読み取りだけ**にする(タスクの作成・更新・完了報告などは、次の段階で足す)。

### 範囲に入れないこと
- Web 画面の変更(ただし、ログインの承認ページだけは要る。[3.2](#32-ログインの流れ))
- Windows 向けの配布(後で)
- 他のユーザーの代理操作、管理系の操作

## 2. コマンド案

コマンド名は `ningyoutukai`(短縮名 `nt` を別名にする案。決まっていない)。

| コマンド | 内容 |
| --- | --- |
| `ningyoutukai login` | ブラウザで承認して、ログインする([3.2](#32-ログインの流れ)) |
| `ningyoutukai logout` | この端末のログインを取り消す(サーバー側のセッションも無効にする) |
| `ningyoutukai whoami` | ログイン中のユーザー(名前・メール・接続先)を出す |
| `ningyoutukai tasks` | 自分に割り振られたタスクの一覧(全プロダクト) |
| `ningyoutukai tasks --product <名前 or ID>` | プロダクトで絞る |
| `ningyoutukai tasks --status <状態>` | 状態で絞る(`in_progress` 作業中 / `reported` 確認待ち / `rejected` 差し戻し中 / `completed` 完了。`api/src/lib/task-flow.ts` の `taskStatuses`) |
| `ningyoutukai task <タスク ID>` | 1 件の詳細(メッセージを含む) |

共通のオプション:
- `--json`: 機械が読める JSON で出す(スクリプトや AI エージェントから使う想定。既定は表)
- `--api <URL>`: 接続先(環境変数 `NINGYOUTUKAI_API_URL` でも指定できる。既定は本番の URL)
- 終了コード: 成功 0 / 使い方の誤り 2 / 未ログインや期限切れ 3 / API エラー 1

出力の例:

```
$ ningyoutukai tasks
プロダクト      タスク                     状態        ID
人形使い        CLI の仕様を書く           作業中      3f2a…
人形使い        招待の候補のレビュー       確認待ち    91bc…
別のプロダクト  README を直す              差し戻し中  c07d…
```

## 3. 認証

### 3.1 方式: デバイスコード + ベアラートークン

今の API は、ブラウザの cookie(GitHub / Google のログイン)で認証している。CLI にはブラウザがないので、**OAuth のデバイス認可(RFC 8628)** を使う。

- Better Auth の公式プラグインを使う: `device-authorization`(コードの発行と承認)と `bearer`(`Authorization: Bearer <トークン>` でセッションを受ける)
- CLI には、GitHub / Google のパスワードも秘密も渡さない。CLI が受け取るのは、**この人形使い用のセッショントークンだけ**
- `authGuard`(`auth.api.getSession({ headers })`)は、`bearer` プラグインを有効にすると、トークンも受けられる。**既存のルートは変えない**

採用しない案:
- **API キーを発行する**: 画面に「キーの発行」ページが要る。キーが漏れたときの扱い(失効・一覧)も作ることになる。後で必要になったら足す
- **ブラウザの cookie を貼り付ける**: 秘密の扱いが危ない。期限も短い

### 3.2 ログインの流れ

```
CLI                         api                       ブラウザ(Web)
 │ POST /api/auth/device/code │                              │
 │ ─────────────────────────▶ │ device_code, user_code 発行   │
 │ ◀───────────────────────── │                              │
 │ 「https://…/device を開いて、                              │
 │   コード ABCD-EFGH を入力」を表示(ブラウザも開く)         │
 │                            │ ◀──── /device でコード入力 ──│
 │                            │       (ログイン済みの画面で承認 / 拒否)
 │ POST /api/auth/device/token(5 秒おきに確認)               │
 │ ─────────────────────────▶ │ 承認されたら、トークンを返す  │
 │ ◀───────────────────────── │                              │
 │ トークンを保存                                              │
```

- **Web に承認ページ `/device` を足す**(ログイン必須。コード入力 → 「このコマンドラインツールにログインを許可しますか」→ 許可 / 拒否)
- コードの有効期限は 15 分、確認の間隔は 5 秒(Better Auth の既定値)
- `client_id` は固定の `ningyoutukai-cli` だけを許可する(`validateClient`)

### 3.3 トークンの保存

- 保存先: `~/.config/ningyoutukai/credentials.json`(権限 `0600`、ディレクトリは `0700`)。`XDG_CONFIG_HOME` があればそれに従う
- 中身: 接続先 URL、トークン、ユーザー ID、保存した日時。**平文で保存する**(OS のキーチェーンは、使わない。後で検討)
- 環境変数 `NINGYOUTUKAI_TOKEN` があれば、それを優先する(CI やコンテナ向け)
- `logout` はファイルを消し、サーバーのセッションも無効にする

### 3.4 有効期限と失効
- トークンは Better Auth のセッションと同じ寿命(既定 7 日、使うたびに延長)。期限切れは、終了コード 3 と「`ningyoutukai login` で再ログインしてください」を出す
- 他の端末のセッションを一覧・失効する画面は、この段階では作らない(Better Auth の `listSessions` / `revokeSession` を使えば、後で足せる)

## 4. API の追加と変更

| 項目 | 内容 |
| --- | --- |
| プラグイン | `auth.ts` に `deviceAuthorization({ verificationUri: "/device", validateClient })` と `bearer()` を足す |
| DB | `deviceCode` テーブルの追加(Better Auth のスキーマ生成 → `auth-schema.ts` → drizzle のマイグレーション)。**本番にマイグレーションが要る**(先に `migrate`) |
| `GET /api/me/task` | **新規**。ログイン中のユーザーに割り振られたタスクを、全プロダクトをまたいで返す。クエリ: `productId`、`status`。各行に、プロダクトの ID と名前を含める |
| `GET /api/me` | **新規**(または既存の session 取得を使う)。`whoami` 用 |
| 既存 | `GET /api/product/:productId/task/:taskId`(詳細)・`.../message`(メッセージ)をそのまま使う。**変更なし** |

`GET /api/me/task` を新設する理由: 今ある API で全プロダクトのタスクを取るには、「プロダクト一覧 → 各プロダクトの自分のメンバー → そのタスク」と、プロダクトの数だけ呼ぶことになる。本番は Workers 無料枠の CPU 制限(10ms)があり、リクエストを増やしたくない。1 回の呼び出しで返す。

## 5. 実装

- 置き場所: リポジトリの `cli/`(`api/`・`web/` と同じ階層)。Bun + TypeScript
- API の呼び出しは、web と同じ **Eden Treaty**(`api` の型をそのまま使う。型の食い違いをコンパイルで防ぐ)
- 引数の解析は、依存を増やさず、`node:util` の `parseArgs` で足りる範囲にする(サブコマンドが増えたら再検討)
- 配布: `bun build --compile` で単一バイナリにして、GitHub Releases に添付する(macOS arm64 / x64、Linux x64)。ビルドとアップロードは Actions で自動化する(別 PR)
- テスト: コマンドの解析・出力の整形・認証情報の保存(権限 0600)は単体テスト。API は既存の `tests/` の流儀で、`/api/me/task` と、デバイスコード → トークンの流れを通す

## 6. 作業の分け方(PR の単位)

ブランチ名には `v3` を付ける(例: `feat/v3.0/cli-login`)。`dev` から切って `dev` に PR。

1. **api**: `bearer` + `device-authorization`、`deviceCode` のマイグレーション、`GET /api/me/task`(+ `/api/me`)とテスト
2. **web**: `/device` の承認ページ
3. **cli**: 骨組み、`login` / `logout` / `whoami`、認証情報の保存
4. **cli**: `tasks` / `task`、`--json`
5. **ci**: バイナリのビルドと Releases への添付、`docs/` の使い方

## 7. 決めたいこと(未決)

1. コマンド名は `ningyoutukai` でよいか。短縮名 `nt` を足すか
2. トークンの保存は、平文のファイル(`0600`)でよいか(OS のキーチェーンにする案もある。macOS / Linux で実装が分かれる)
3. `tasks` の既定の絞り込み: 全部か、「完了以外」か(完了済みを含めるには `--all`)
4. 配布: GitHub Releases の単一バイナリだけでよいか(npm / Homebrew は、必要になったら)
5. **この段階を読み取りだけにしてよいか**(完了報告・メッセージ投稿などの書き込みは、次の段階)
6. v3.0 には、CLI のほかに入れる機能があるか(ある場合は、この文書の外で、同じ `docs/v3.0/` にまとめる)
