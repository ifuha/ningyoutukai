# ningyoutukai

| ディレクトリ | 内容 | ポート |
| --- | --- | --- |
| `web/` | フロントエンド(TanStack Start。認証は BetterAuth のクライアントから api に接続) | 3000 |
| `api/` | バックエンド(Elysia + drizzle + PostgreSQL。認証は BetterAuth) | 3001 |

## 必要なもの

- [Bun](https://bun.sh/)(api 用)
- Node.js / npm(web 用)
- Docker(PostgreSQL 用。**docker compose v2**、つまり `docker compose` コマンドが前提です。`docker-compose` では動作を確認していません)

## api の起動

```bash
cd api
bun install
cp .env.example .env          # 値は空欄のものを下の説明に沿って埋める
docker compose up -d --wait   # PostgreSQL 17 を localhost:5433 で起動
bunx drizzle-kit migrate      # マイグレーション適用
bun run dev                   # http://localhost:3001
```

- 停止: `docker compose down`(データも消す場合は `docker compose down -v`)
- API のポートを変える場合は環境変数 `PORT` を指定してください。
- Swagger UI: http://localhost:3001/swagger (OpenAPI の定義は `/swagger/json`)。Elysia のルートが自動で載ります。

### DB のポート(5433)が使用中のとき

DB のポートは **5433** です(ホストにローカルの Postgres があっても 5432 と衝突しないようにしています)。5433 も使用中なら、`api/docker-compose.yml` の `ports` の左側(`"5433:5432"` の `5433`)を空いているポートに変え、`api/.env` の `DATABASE_URL` のポートも同じ値に揃えてください。変えたら `docker compose up -d --wait` をやり直します。

### api/.env の設定

`api/.env.example` をコピーして作ります。`.env` はコミットしないでください。

| 変数 | 説明 |
| --- | --- |
| `DATABASE_URL` | DB の接続先。docker compose の既定のままで動きます |
| `BETTER_AUTH_SECRET` | 認証の署名用の秘密。`openssl rand -hex 32` などで生成します。開発では空でも起動しますが、**本番では必須**です |
| `BETTER_AUTH_URL` | api 自身の URL(省略時 `http://localhost:3001`)。OAuth のコールバック URL の元になります |
| `WEB_ORIGIN` | web の URL(省略時 `http://localhost:3000`)。CORS の許可と、ログイン後の戻り先として信頼する URL(better-auth の `trustedOrigins`)に使います |
| `GITHUB_CLIENT_ID` / `GITHUB_CLIENT_SECRET`、`GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` | GitHub / Google でログインするための OAuth の情報。未設定だとログインのボタンが動きません。取得と登録の手順は [docs/oauth-setup.md](./docs/oauth-setup.md) |
| `RESEND_API_KEY` / `MAIL_FROM` | メール通知(Resend)用。`RESEND_API_KEY` が未設定なら、メールは送らず、ログに出すだけです(開発・テストではこれで問題ありません)。`MAIL_FROM` は送信元(例: `人形使い <noreply@example.com>`) |

メール通知の注意: Resend の無料の試用(送信元 `onboarding@resend.dev`)では、Resend に登録したアドレス以外には送れません。実際の利用者に送るには、Resend で独自ドメインを認証し、そのドメインのアドレスを `MAIL_FROM` に指定してください。

### スキーマを変更するとき

テーブル定義は `api/src/db/schema/`(入口は `index.ts`、テーブルごとにファイルが分かれています)と、認証用の `api/src/db/auth-schema.ts` にあります(`api/drizzle.config.ts` が両方を読みます)。編集してから、`api` ディレクトリで次を実行します。

```bash
bunx drizzle-kit generate   # api/drizzle/ にマイグレーションを生成(コミットすること)
bunx drizzle-kit migrate    # DB に適用
```

### テスト

`api` ディレクトリで `bun test`(または `bun run test`)。**開発用の DB(`DATABASE_URL`)に対して実行され**、テスト用のデータを作って消します。

## web の起動

```bash
cd web
npm install
```

認証(better-auth)は **api 側**で動いています(`/api/auth/*`、ユーザー・セッションは DB に保存)。web は `authClient` から api に接続します。

api の URL を変えたいときだけ、`web/.env` に次を書きます(省略時は `http://localhost:3001`。`web/src/lib/api.ts` 参照)。

```
VITE_API_URL=http://localhost:3001
```

```bash
npm run dev     # http://localhost:3000
npm run build   # ビルド確認
```
