# 本番デプロイの手順書

web / api を Cloudflare Workers、Postgres を Neon(Hyperdrive 経由)、バックアップを R2 に置く構成を、**自分のコマンドで**本番に上げる手順。構成の背景は [infra.md](./infra.md)。

この手順書のコマンドは、**Cloudflare / Neon のアカウントに変更を加える**(リソース作成、デプロイ、課金の可能性)。リポジトリ側の準備(設定ファイル、コード)は済んでいるので、ここに書いたものを上から順に実行する。値(接続文字列、シークレット)は、この文書にもリポジトリにも書かない。

## 目次

0. [全体像と、先に決めること](#0-全体像と先に決めること)
1. [Neon のプロジェクトを作る](#1-neon-のプロジェクトを作る)
2. [マイグレーションを実行する](#2-マイグレーションを実行する)
3. [Hyperdrive を作る](#3-hyperdrive-を作る)
4. [api の設定(vars とシークレット)](#4-api-の設定vars-とシークレット)
5. [OAuth のコールバック URL を登録する](#5-oauth-のコールバック-url-を登録する)
6. [デプロイする(api → web)](#6-デプロイするapi--web)
7. [デプロイ後の確認](#7-デプロイ後の確認)
8. [R2 とバックアップ](#8-r2-とバックアップ)
9. [ロールバック](#9-ロールバック)
10. [費用の目安](#10-費用の目安)
11. [トラブルシュート](#11-トラブルシュート)
12. [付録: 案 D(カスタムドメイン)にする場合](#12-付録-案-dカスタムドメインにする場合)

## 0. 全体像と、先に決めること

```
ブラウザ ──https://ningyoutukai-web.<sub>.workers.dev──▶ web の Worker
                                                          │ /api/* だけ サービスバインディング(API)
                                                          ▼
                                                      api の Worker ──Hyperdrive──▶ Neon(Postgres)
```

### cookie / オリジンの設計: 案 S(同一オリジン)を採用

`*.workers.dev` どうしは別サイト扱い(`workers.dev` は Public Suffix List に載っている)で、`web.xxx.workers.dev` と `api.xxx.workers.dev` では cookie が共有されない。そこで、**ブラウザから見えるオリジンを web の 1 つだけにする。**

- web の Worker(`web/src/worker.ts`)が、パスが `/api/` で始まるリクエストを、サービスバインディング `API` で api の Worker に転送する。それ以外は TanStack Start の SSR に渡す。
- cookie は web のオリジンに付く(同一サイト)。CORS は不要。
- OAuth のコールバックは `https://<web のオリジン>/api/auth/callback/<provider>`。
- web のブラウザ側コードは、`VITE_API_URL` を空にして(`web/.env.production` で既定になっている)、相対パス `/api/...` で api を呼ぶ。
- カスタムドメインは不要。後からカスタムドメインを付けても、そのまま動く(`BETTER_AUTH_URL` / `WEB_ORIGIN` をそのドメインに変える)。

案 S はローカルの `wrangler dev` で成立を確認済み(web 経由で `/api/auth/get-session`、認証つきの `/api/product` が api に届く)。**デプロイした実環境では未確認**なので、[7. デプロイ後の確認](#7-デプロイ後の確認)で確かめる。

カスタムドメイン(`app.example.com` と `api.example.com`)を用意できる場合は、案 D も使える(コードは対応済み。[12. 付録](#12-付録-案-dカスタムドメインにする場合))。

### 先に用意するもの

| もの | 備考 |
| --- | --- |
| Cloudflare アカウント | `npx wrangler login` でログインする。Workers の `workers.dev` サブドメインを決めておく(初回のデプロイで聞かれる) |
| Neon アカウント | |
| GitHub OAuth アプリ / Google OAuth クライアント | 本番用を新しく作る(コールバック URL が本番のため)。手順は [oauth-setup.md](./oauth-setup.md) |
| Resend の API キーと送信元アドレス | 招待・通知メール用。未設定でも api は動く(メールが送られないだけ) |
| 手元のツール | `bun`、`node` / `npm`、`docker`(バックアップ用)。`psql` は任意 |

コマンドは、特に書かない限りリポジトリのルートから実行する。

## 1. Neon のプロジェクトを作る

Neon のコンソール(<https://console.neon.tech>)で操作する。

1. **プロジェクトを作成する。** 名前は `ningyoutukai` など。Postgres のバージョンは **17**(`infra/scripts` の `pg_dump` が postgres:17 のため。揃える)。
2. **リージョン**: アジアの近いほうを選ぶ。Neon のコンソールの選択肢を確認し、**東京があれば東京、なければ Singapore(`aws-ap-southeast-1`)**。Cloudflare の Worker は利用者に近い所で動き、Hyperdrive が DB の近くに接続を保つので、リージョンは DB 側(日本の利用者に近いほう)で決める。作成後は変更できない(変えるなら作り直し)。
3. **データベース名とロール**: 既定の `neondb` / `neondb_owner` のままでもよいが、DB 名は `ningyoutukai` にしておくとダンプのファイル名と揃う。ロールは `neondb_owner`(マイグレーションに DDL の権限が要るため、この手順ではオーナー権限のロールを使う)。
4. **接続文字列を 2 種類控える**(コンソールの「Connect」)。
   - **direct**(「Connection pooling」を **オフ**): ホスト名に `-pooler` が**入らない**。`postgres://<role>:<password>@ep-xxxx.<region>.aws.neon.tech/<db>?sslmode=require`
   - pooled: ホスト名に `-pooler` が入る。**この構成では使わない**(Hyperdrive が接続プールを持つので二重になる。drizzle-kit のマイグレーションはセッション単位の機能を使うため、pooled だと失敗しうる)。
5. 以降、direct の接続文字列を、シェルの環境変数に入れて使う(履歴に残したくないので、ファイルに書かずに入力する)。

```sh
read -s NEON_DIRECT_URL && export NEON_DIRECT_URL   # 貼り付けて Enter(画面には出ない)
```

Neon の Free / Launch プランでは、無通信が続くと compute が停止し(scale to zero)、最初のクエリが数百 ms〜1 秒ほど遅くなる。気になる場合は、Launch で停止までの時間を調整できる(Neon のコンソールで確認)。

## 2. マイグレーションを実行する

**Hyperdrive ではなく、Neon の direct 接続**を使い、手元から実行する。

```sh
cd api
bun install
DATABASE_URL="$NEON_DIRECT_URL" bun run db:migrate
```

- `db:migrate` は `drizzle-kit migrate`(`api/package.json`)。`drizzle/` 以下のマイグレーションを順に適用する。適用済みのものは `drizzle.__drizzle_migrations` に記録され、再実行しても再適用されない。
- `api/drizzle.config.ts` は `dotenv/config` を読むが、**シェルの環境変数が優先される**(`api/.env` に開発用の値があっても、上書きされない)。
- 確認(任意): `psql "$NEON_DIRECT_URL" -c '\dt'` で `products`、`tasks`、`user` などが見える。
- スキーマを変えたとき(`bun run db:generate` でマイグレーションを作ったとき)は、**デプロイの前に**、同じ手順で本番に適用する。api の旧バージョンが動いている間に適用しても壊れない変更(列の追加など)にするのが安全。

## 3. Hyperdrive を作る

```sh
cd api
npx wrangler hyperdrive create ningyoutukai-db \
  --connection-string="$NEON_DIRECT_URL" \
  --caching-disabled
```

- 接続文字列は **direct** を使う。
- **`--caching-disabled` を付ける。** Hyperdrive は、既定で SELECT の結果を短時間キャッシュする。この app は、書き込み直後に一覧を読み直す画面が多く、古い結果が返ると壊れて見える。
- 出力される `id`(UUID)を、`api/wrangler.jsonc` の `hyperdrive[0].id` の `REPLACE_WITH_HYPERDRIVE_ID` に置き換えてコミットする(id は秘密ではない)。
- Hyperdrive は接続文字列(パスワードを含む)を Cloudflare 側に保存する。パスワードを変えたら `wrangler hyperdrive update` で更新する。

## 4. api の設定(vars とシークレット)

### vars(秘密でない値): `api/wrangler.jsonc` の `vars`

デプロイ前に、`<...>` の部分を実際の値に書き換えてコミットする。

| 変数 | 案 S の値 | 説明 |
| --- | --- | --- |
| `BETTER_AUTH_URL` | `https://ningyoutukai-web.<サブドメイン>.workers.dev` | better-auth の基準 URL。OAuth のコールバックはここから作られる。**案 S では web の URL** |
| `WEB_ORIGIN` | 同上 | CORS の許可と、better-auth の `trustedOrigins`。案 S では同一オリジンなので CORS は使われないが、`trustedOrigins`(CSRF 対策のオリジン検査)に必要 |
| `MAIL_FROM` | 例: `人形使い <noreply@example.com>` | 招待メールなどの送信元。Resend で認証済みのドメインのアドレス |
| `COOKIE_DOMAIN` | (案 S では設定しない) | 案 D のときだけ。`.example.com` |

`<サブドメイン>` は、Cloudflare アカウントの `workers.dev` サブドメイン(ダッシュボードの Workers & Pages に表示。初回の `wrangler deploy` で決める)。web を一度もデプロイしていないと URL が確定しないので、**先に web の名前(`ningyoutukai-web`)とサブドメインから URL を組み立てる**か、初回は仮の値で api → web とデプロイして URL を確定し、vars を直して api を再デプロイする。

### シークレット: `wrangler secret put`

`api` ディレクトリで、1 つずつ入力する(値を聞かれる。履歴に残らない)。`DATABASE_URL` は不要(Hyperdrive を使う)。

```sh
cd api
npx wrangler secret put BETTER_AUTH_SECRET     # openssl rand -hex 32 などで作ったランダム文字列。本番で必須
npx wrangler secret put GITHUB_CLIENT_ID
npx wrangler secret put GITHUB_CLIENT_SECRET
npx wrangler secret put GOOGLE_CLIENT_ID
npx wrangler secret put GOOGLE_CLIENT_SECRET
npx wrangler secret put RESEND_API_KEY         # 任意(未設定ならメールは送られない)
```

`wrangler secret put` は、Worker がまだ無いと「作成するか」を聞いてくる。先に [6.](#6-デプロイするapi--web) の api のデプロイをしてから入れても、先に入れてもよい(どちらでも、シークレットを入れたあとに再デプロイは不要。値の反映は次のリクエストから)。

`api/.env.example` との対応:

| `.env.example` | 本番での置き場所 |
| --- | --- |
| `DATABASE_URL` | 使わない(Hyperdrive の `HYPERDRIVE` バインディング)。マイグレーションとバックアップのときだけ、手元で Neon の direct を渡す |
| `BETTER_AUTH_URL` / `WEB_ORIGIN` / `MAIL_FROM` | vars |
| `BETTER_AUTH_SECRET`、`GITHUB_*`、`GOOGLE_*`、`RESEND_API_KEY` | シークレット |
| `COOKIE_DOMAIN` | vars(案 D のみ) |

GitHub / Google は、片方だけでも動く(揃っているプロバイダだけが有効になる)。

## 5. OAuth のコールバック URL を登録する

案 S のコールバックは、**web のオリジン**上の `/api/auth/callback/<provider>`(`BETTER_AUTH_URL` + パス)。api の `workers.dev` の URL ではない。

| プロバイダ | 登録する URL |
| --- | --- |
| GitHub(Authorization callback URL) | `https://ningyoutukai-web.<サブドメイン>.workers.dev/api/auth/callback/github` |
| Google(承認済みのリダイレクト URI) | `https://ningyoutukai-web.<サブドメイン>.workers.dev/api/auth/callback/google` |

- GitHub の Homepage URL は web の URL。
- Google は、同意画面の公開状態が「テスト」だと、テストユーザーに入れたアカウントしかログインできない。
- **要確認**: Google が `*.workers.dev` のリダイレクト URI を受け付けるかは、このリポジトリでは試していない。受け付けない場合は、GitHub ログインだけで始めるか、カスタムドメイン(案 D)にする。
- 開発用の OAuth アプリ(`localhost`)とは別に、本番用を作るのが安全。

## 6. デプロイする(api → web)

**api を先にデプロイする。** web の `services` バインディング(`ningyoutukai-api`)の先の Worker が無いと、web のデプロイが失敗する。

```sh
# 1. api
cd api
npx wrangler deploy --dry-run        # 事前確認(バンドルが作れること。デプロイされない)
bun run deploy                       # = wrangler deploy

# 2. web
cd ../web
npm ci
npm run deploy                       # = npm run build && wrangler deploy
```

- web のビルドは、`web/.env.production` により `VITE_API_URL` が空(同一オリジン)になる。
- 初回の `wrangler deploy` で、`workers.dev` サブドメインの登録を聞かれることがある。
- api の `workers.dev` の URL も公開される(web を経由せず直接アクセスできる)。直接アクセスしたくなければ、`api/wrangler.jsonc` に `"workers_dev": false` を足す(サービスバインディングは影響を受けないはずだが、このリポジトリでは試していない)。`/swagger` は web 経由では見えない(`/api/` 以外は web が受けるため)。api の `workers.dev` の URL なら見える。
- CI から行う場合は、`CLOUDFLARE_API_TOKEN` と `CLOUDFLARE_ACCOUNT_ID` を環境変数で渡す(トークンの権限は「Edit Cloudflare Workers」)。

## 7. デプロイ後の確認

`WEB=https://ningyoutukai-web.<サブドメイン>.workers.dev` として:

```sh
curl -s "$WEB/"                              # web の HTML(200)
curl -s "$WEB/api/auth/get-session"          # null(未ログイン。api に届いている証拠)
curl -s -o /dev/null -w "%{http_code}\n" "$WEB/api/product"   # 401(未ログイン)
```

次に、ブラウザで確認する。

1. `$WEB/` を開き、GitHub(または Google)でログインする。認可画面 → 許可 → web に戻り、ログイン済みの画面になる。
2. 開発者ツールの Application → Cookies で、`$WEB` のオリジンに `__Secure-better-auth.session_token` があること。
3. プロダクトを作成する。一覧に出ること、リロードしても残ることを確認する(Hyperdrive のキャッシュ無効も確認できる)。
4. ログアウトして、ログイン画面に戻ること。

ログは `npx wrangler tail ningyoutukai-api`(api の `console.log` やエラー)で見る。

## 8. R2 とバックアップ

### 役割分担

| 手段 | 守るもの | 範囲 |
| --- | --- | --- |
| Neon の履歴(ブランチの復元) | 直前の誤操作・誤削除の巻き戻し | プランで決まる(Launch で最大 7 日、Free は短い。Neon の現行の仕様を確認) |
| R2 へのダンプ | Neon の外に持つ、長期・別系統のコピー(Neon の障害、アカウントの問題、履歴の期間外の復旧) | 保持日数は `RETENTION_DAYS`(既定 30 日) |

### R2 の準備

1. Cloudflare ダッシュボードの R2 でバケット(例: `ningyoutukai-backup`)を作る。公開設定はしない。CLI なら `npx wrangler r2 bucket create ningyoutukai-backup`。
2. 「R2 API トークンを管理」から、そのバケットだけに「オブジェクトの読み取りと書き込み」を許可したトークンを作る。得られる Access Key ID / Secret Access Key を控える(`PRUNE=1` を使うなら削除できる権限も)。
3. アカウント ID(`R2_ACCOUNT_ID`)を控える。

詳細は [infra/README.md](../infra/README.md)。

### 手元から 1 回取る(動作確認)

```sh
export DATABASE_URL="$NEON_DIRECT_URL"          # direct を使う
export USE_DOCKER=1                              # pg_dump を postgres:17 の docker で実行
export R2_ACCOUNT_ID=... R2_BUCKET=ningyoutukai-backup
export R2_ACCESS_KEY_ID=... R2_SECRET_ACCESS_KEY=...
infra/scripts/backup.sh                          # dump → R2 保存 → 整理の対象表示。保存先のキーが出力される
```

### 定期実行: GitHub Actions のスケジュール実行(第一案)

Cloudflare の Cron Trigger は Worker を起動するだけで、Worker の中では `pg_dump` を実行できない(コンテナを使わない前提)。そこで、**GitHub Actions のスケジュール実行**で `infra/scripts/backup.sh` を動かす。

1. GitHub のリポジトリの Settings → Secrets に、`NEON_DATABASE_URL`(direct)、`R2_ACCOUNT_ID`、`R2_BUCKET`、`R2_ACCESS_KEY_ID`、`R2_SECRET_ACCESS_KEY` を登録する。
2. `.github/workflows/backup.yml` を作る(例。リポジトリには未追加)。

```yaml
name: backup
on:
  schedule:
    - cron: "0 17 * * *"   # UTC 17:00 = 日本時間 02:00
  workflow_dispatch: {}
jobs:
  backup:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - run: infra/scripts/backup.sh
        env:
          DATABASE_URL: ${{ secrets.NEON_DATABASE_URL }}
          USE_DOCKER: "1"
          R2_ACCOUNT_ID: ${{ secrets.R2_ACCOUNT_ID }}
          R2_BUCKET: ${{ secrets.R2_BUCKET }}
          R2_ACCESS_KEY_ID: ${{ secrets.R2_ACCESS_KEY_ID }}
          R2_SECRET_ACCESS_KEY: ${{ secrets.R2_SECRET_ACCESS_KEY }}
          PRUNE: "1"
```

- 失敗すると GitHub が通知する(Actions の失敗通知)。スケジュール実行は、リポジトリに 60 日動きがないと止まる点に注意。
- ダンプにはユーザーのメールアドレスが入る。ワークフローのログにダンプの中身を出さない(`backup.sh` は出さない)。
- 代替案: Neon のダンプを Cloudflare Containers の Cron で取る(コストと運用が増えるので、第二案)。

### リストアの確認

最初のバックアップができたら、**必ず 1 回リストアを試す**(使い捨ての Postgres に)。手順は [infra/README.md](../infra/README.md) の「リストア」。Neon 本体を復旧するときは、新しい Neon プロジェクト(またはブランチ)を作り、`pg_restore --no-owner --no-acl -d "<新しい direct 接続>" <ダンプ>` で戻し、Hyperdrive の接続先を `wrangler hyperdrive update` で切り替える。

## 9. ロールバック

### アプリ(Worker)

```sh
cd api   # または web
npx wrangler deployments list           # デプロイの履歴
npx wrangler rollback                   # 1 つ前のバージョンに戻す(バージョン ID の指定も可)
```

api と web は独立してロールバックできる。`/api/*` の形(契約)を変えたデプロイをするときは、web と api の新旧の組み合わせで壊れないか注意する(互換性を保つ変更を先に api に入れる)。

### DB

- drizzle のマイグレーションに down は無い。破壊的な変更(列の削除など)は、避けるか、2 段階(まず使わなくする → 後で消す)にする。
- マイグレーションの前に、Neon のブランチを切るか、`backup.sh` を実行しておく。
- 戻すときは、Neon の履歴からの復元(コンソールの Restore)か、R2 のダンプからのリストア。

### Hyperdrive / シークレット

- シークレットを間違えたら、`wrangler secret put` で入れ直す。
- Hyperdrive の接続先を戻すなら `wrangler hyperdrive update ningyoutukai-db --connection-string=...`。

## 10. 費用の目安

概算。価格は変わるので、契約前に各社の料金ページで確認する。

| 項目 | 目安 |
| --- | --- |
| Workers(web / api) | Free は 1 日 10 万リクエスト、**1 リクエストの CPU 時間は 10 ms まで**。超えるなら Paid($5/月、CPU 30 秒まで・10 M リクエスト込み)。api のバンドルは gzip で約 660 KiB(Free の上限 3 MiB 以内) |
| サービスバインディング | 追加料金なし(web → api の呼び出しは、api 側のリクエストとして数える) |
| Hyperdrive | Workers の枠内で追加料金なし(Free プランにも 1 日あたりのクエリ数の上限がある) |
| Neon | Free(小さい DB なら 0 円。ストレージと compute 時間に上限、無通信で停止)。Launch は従量(使用量次第で月 $5〜20 程度) |
| R2 | 保存 10 GB まで無料。ダンプは小さいので、ほぼ 0 円。外向きの転送料(egress)は無料 |
| GitHub Actions | 公開リポジトリは無料。非公開は無料枠内に収まる(1 日 1 回、数分) |

最小構成は 0 円で始められる。Free の Workers で CPU 10 ms を超えるリクエストが出る場合(`wrangler tail` や ダッシュボードの「Exceeded CPU」)だけ、Workers Paid($5/月)にする。

## 11. トラブルシュート

| 症状 | 原因と対処 |
| --- | --- |
| api が 500、ログに `connect ECONNREFUSED` / `ETIMEDOUT` | Hyperdrive の接続先に届いていない。接続文字列が direct か、`?sslmode=require` が付いているか、Neon の compute が起動中でないかを確認。`npx wrangler hyperdrive get ningyoutukai-db` で設定を見る |
| `password authentication failed` | Hyperdrive に入れたパスワードが古い。Neon でパスワードを変えたあとは `wrangler hyperdrive update` |
| 初回のリクエストだけ遅い | Neon の scale to zero(compute の再開)。Launch で停止を遅らせるか、許容する |
| `wrangler dev` が `use a local Postgres connection string` で止まる | hyperdrive の `localConnectionString` か、環境変数 `CLOUDFLARE_HYPERDRIVE_LOCAL_CONNECTION_STRING_HYPERDRIVE` が必要。`api/wrangler.jsonc` に既定値(docker compose の DB)が入っている |
| `wrangler deploy` が `REPLACE_WITH_HYPERDRIVE_ID` で失敗 | [3.](#3-hyperdrive-を作る) の id の置き換えを忘れている |
| web のデプロイで「service not found」 | api を先にデプロイしていない、または `services[].service` が api の `name`(`ningyoutukai-api`)と違う |
| ログインしても cookie が付かない / すぐログアウトされる | (案 S)`BETTER_AUTH_URL` が web のオリジンと一致しているか(`https`、サブドメイン、末尾にスラッシュなし)。`BETTER_AUTH_SECRET` を途中で変えると、既存のセッションが全部無効になる。ブラウザで web の別オリジン(api の `workers.dev` の URL)を開いてログインしようとしていないか |
| OAuth で `redirect_uri_mismatch` | 登録したコールバック URL が `<BETTER_AUTH_URL>/api/auth/callback/<provider>` と違う。案 S では web のオリジンで登録する |
| ログイン後に `/?error=...` に戻る | [oauth-setup.md](./oauth-setup.md) の表を参照 |
| ブラウザのコンソールに CORS エラー | 案 S なら本来出ない。web のビルドが `VITE_API_URL` を空にできていない可能性(`web/.env.production` があるか、`dist` の JS に `localhost:3001` が入っていないか)。案 D なら `WEB_ORIGIN` が web のオリジンと完全に一致しているか |
| POST が `INVALID_ORIGIN` / `403` | better-auth の `trustedOrigins`(= `WEB_ORIGIN`)と、リクエストの `Origin` が違う。案 S では web のオリジンを入れる |
| `/swagger` が 404 | web 経由では見えない。api の `workers.dev` の URL で開く |

## 12. 付録: 案 D(カスタムドメイン)にする場合

`app.example.com`(web)と `api.example.com`(api)のように、**同じ親ドメイン**で 2 つのホスト名を用意できる場合の設定。同一サイトなので、`SameSite=Lax` の cookie が web からの `fetch` に付く(CORS は必要)。

1. ドメインを Cloudflare のゾーンに追加し、Workers の Custom Domain(または route)で、`app.example.com` を web、`api.example.com` を api に割り当てる(`wrangler.jsonc` の `routes` に `{ "pattern": "api.example.com", "custom_domain": true }` など)。
2. `api/wrangler.jsonc` の `vars`: `BETTER_AUTH_URL=https://api.example.com`、`WEB_ORIGIN=https://app.example.com`、`COOKIE_DOMAIN=.example.com`。`COOKIE_DOMAIN` があると、better-auth の `advanced.crossSubDomainCookies` が有効になり、cookie の `Domain` が `.example.com` になる(`api/src/auth.ts`。未設定なら従来どおり)。
3. web は `VITE_API_URL=https://api.example.com npm run build && npx wrangler deploy`(シェルの環境変数が `.env.production` より優先される)。`web/wrangler.jsonc` の `services` バインディングは残してよい(使われないだけ)。
4. OAuth のコールバック URL は `https://api.example.com/api/auth/callback/<provider>`(api のオリジン)。
5. 確認は [7.](#7-デプロイ後の確認) の `$WEB` を `https://app.example.com`、api への確認を `https://api.example.com` にして同様に行う。cookie の `Domain` が `.example.com` になっていること。

案 S と案 D は、`vars` と web のビルドの `VITE_API_URL` の違いだけで切り替えられる。
