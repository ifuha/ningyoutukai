# ningyoutukai

| ディレクトリ | 内容 | ポート |
| --- | --- | --- |
| `web/` | TanStack Start + BetterAuth(フロント) | 3000 |
| `api/` | Elysia + drizzle + PostgreSQL(API) | 3001 |

## 必要なもの

- [Bun](https://bun.sh/)(api 用)
- Node.js / npm(web 用)
- Docker(PostgreSQL 用)

## api の起動

```bash
cd api
bun install
cp .env.example .env          # DATABASE_URL が入っています
docker compose up -d --wait   # PostgreSQL 17 を localhost:5433 で起動
bunx drizzle-kit migrate      # マイグレーション適用
bun run dev                   # http://localhost:3001
```

- DB のポートは **5433** です(ホストにローカルの Postgres があっても 5432 と衝突しないようにしています)。
- 停止: `docker compose down`(データも消す場合は `docker compose down -v`)
- API のポートを変える場合は環境変数 `PORT` を指定してください。
- Swagger UI: http://localhost:3001/swagger (OpenAPI の定義は `/swagger/json`)。Elysia のルートが自動で載ります。

### スキーマを変更するとき

`api/src/db/schema.ts` を編集してから、次を実行します。

```bash
bunx drizzle-kit generate   # drizzle/ にマイグレーションを生成(コミットすること)
bunx drizzle-kit migrate    # DB に適用
```

## web の起動

```bash
cd web
npm install
```

認証(better-auth)は **api 側**で動いています(`/api/auth/*`、ユーザー・セッションは DB に保存)。web は `authClient` から api に接続します。

`web/.env` を作成して次を設定します(値は共有を受けてください。コミットしないこと)。

```
ANTHROPIC_API_KEY=
VITE_API_URL=http://localhost:3001   # 省略時も同じ値
```

`api/.env` の `BETTER_AUTH_SECRET` は `openssl rand -hex 32` などで生成してください。

```bash
npm run dev     # http://localhost:3000
npm run build   # ビルド確認
```
