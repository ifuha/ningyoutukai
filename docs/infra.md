# インフラ要件メモ

## 要件

1. **Cloudflare Containers にデプロイする**
2. **R2 に DB のダンプを保存する**

## 現状(2026-10 時点)

- `api/`(Elysia + Bun + drizzle)と PostgreSQL は、ローカルでは `api/docker-compose.yml` で動かしている(Postgres 17、ポート 5433)。
- `web/`(TanStack Start)は `wrangler.jsonc` があり、Cloudflare Workers へのデプロイ(`npm run deploy`)を想定した構成になっている。
- 本番のデプロイ先・DB のホスティングは未整備。

## 1. Cloudflare Containers へのデプロイ

- 対象: 未決定(api のみか、web も含めるか)。
- 必要になるもの(未着手):
  - api 用の `Dockerfile`
  - Containers の設定(`wrangler.jsonc` など)
- 未決定の点:
  - PostgreSQL をどこに置くか(Containers 内か、外部のマネージド DB か)。Containers はディスクが永続化されないため、DB の置き場によってダンプの設計が変わる。
  - マイグレーション(`drizzle-kit migrate`)をデプロイ時のどの段階で実行するか。
  - 環境変数(`DATABASE_URL`、`BETTER_AUTH_SECRET`、`BETTER_AUTH_URL`、`WEB_ORIGIN`)の管理方法。

## 2. R2 への DB ダンプ

- 目的: DB のバックアップを Cloudflare R2 に保存する。
- 方針案: `pg_dump` の出力を R2 にアップロードする(S3 互換 API を利用)。
- 未決定の点:
  - 実行頻度と実行場所(定期実行の方法)。
  - 保持期間(古いダンプの削除ルール)。
  - ダンプの暗号化とアクセス制御(R2 のバケット権限)。
  - リストア手順の整備と確認。

## 今後のタスク候補

- [ ] デプロイ対象と DB の置き場を決める
- [ ] api の `Dockerfile` を作成する
- [ ] Containers へのデプロイ設定を追加する
- [ ] R2 のバケットと、ダンプ用の認証情報を用意する
- [ ] ダンプ(定期実行)とリストアの手順を作成し、動作確認する
