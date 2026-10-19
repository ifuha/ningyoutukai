# インフラ要件メモ

## 構成

| 役割 | 動かす場所 |
| --- | --- |
| アプリ(web / api) | Cloudflare Workers |
| PostgreSQL | Cloudflare Containers(コンテナは Postgres のみ) |
| DB のバックアップ | Cloudflare R2(ダンプの保存のみ) |

```
ブラウザ → Workers(web / api) → Containers(PostgreSQL)
                                        │ pg_dump
                                        ▼
                                       R2(ダンプの保存のみ)
```

## 方針

1. **アプリは Workers で動かす。** コンテナには載せない。web は `wrangler.jsonc` で Workers 向けに構成済み。api(Elysia)も Workers で動かす。
2. **コンテナは PostgreSQL だけ。** Cloudflare Containers で Postgres を動かし、アプリは Workers からそこに接続する。
3. **R2 はダンプの保存だけに使う。** `pg_dump` の出力を R2 に置く。アプリのデータやファイルは R2 に置かない。

## 現状(2026-10 時点)

- ローカルでは `api/docker-compose.yml` で Postgres 17 を動かしている(ポート 5433)。本番の構成は未整備。
- web は Workers 向けの設定(`wrangler.jsonc`)がある。api は Bun + Elysia のローカル起動のみ。

## 留意点

- Containers のディスクは永続化されない。DB のデータは R2 のダンプを頼りに復旧する前提になるため、ダンプの取得とリストアの手順は動作確認までを必須とする。
- 環境変数(`DATABASE_URL`、`BETTER_AUTH_SECRET`、`BETTER_AUTH_URL`、`WEB_ORIGIN`)は、Workers 側のシークレットとして管理する。
- マイグレーション(`drizzle-kit migrate`)は、Postgres コンテナが起動した後、アプリのデプロイ前に実行する。

## タスク

- [ ] Postgres 用の `Dockerfile` と Containers の設定を作成する
- [ ] api を Workers で動かせるようにする(Workers からコンテナの Postgres に接続する)
- [ ] web / api を Workers にデプロイする設定を追加する
- [ ] R2 のバケットと、ダンプ用の認証情報を用意する
- [ ] `pg_dump` を R2 に保存する処理を作る
- [ ] ダンプからのリストア手順を作成し、動作確認する
