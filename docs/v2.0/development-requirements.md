# v2.0 Development Requirements(開発要件)

v2.0 の中心は、**開発環境を分けること**。本番に影響を与えずに、開発・検証・レビュー(デザイナーの確認を含む)ができる環境を整える。

この文書は、要件と、決めること(提案つき)、作業の分け方をまとめる。実装はこれから。

## 1. 位置づけとルール

| 項目 | 内容 |
| --- | --- |
| v1.0 | 本番環境に載せるところまで(機能と画面。本番は Workers + Neon + Hyperdrive + Resend) |
| v1.5 | 現状の課題の修正。**担当者が別に対応する。v2.0 には入れない** |
| v2.0 | 開発環境の分離(この文書) |
| 対象外 | ホームなどの Figma 照合・UX の改善(デザイナーが Figma で進めている。確定後に別途) |
| 未定 | 機能の追加(進行確認・ステータスなど)。[要件定義 5 章](../requirements.md)と[申し送り](../v2-todo.md)を、v2.0 に含めるか([決めること](#6-決めること)の D6) |

### ブランチの運用

- `dev` ブランチは残す。v2.0 の作業は **`dev` から切り、`dev` に向けて PR を出す**。`main` へは、これまでどおり `dev` からのリリース PR でまとめる。
- **v2.0 のブランチ名には `v2` を付ける。** 形式は `<種類>/v2/<内容>`(例: `docs/v2/development-requirements`、`infra/v2/wrangler-envs`、`ci/v2/deploy-pipeline`、`feat/v2/env-badge`)。ブランチ名だけで、v1.5 の修正と区別できるようにする。

## 2. 現状(v1.0 の環境)

| 項目 | ローカル | 本番 |
| --- | --- | --- |
| web / api | `vite dev` / `bun run dev` | Cloudflare Workers(`ningyoutukai-web` / `ningyoutukai-api`)。web が `/api/*` を api にサービスバインディングで転送(同一オリジン) |
| データベース | docker compose の Postgres 17(ポート 5433) | Neon(シンガポール、Postgres 18、DB `neondb`)。Workers からは Hyperdrive(`ningyoutukai-db`、キャッシュ無効)経由 |
| 認証 | GitHub / Google の OAuth アプリ | **同じ OAuth アプリを共用**(GitHub のコールバック URL を本番向けに書き換えたため、ローカルの GitHub ログインは、書き戻すまで使えない) |
| メール | 未設定(ログのみ) | Resend(送信元 `noreply@mail.maars.dev`、送信専用キー) |
| デプロイ | - | 手元から `wrangler deploy`(手動)。`api` を先に、`web` を後に |
| CI | GitHub Actions(`ci.yml`: 型検査・テスト・ビルド) | `migrate.yml`(手動実行)、`backup.yml`(定期実行)もある。シークレットの登録状況は別途確認 |
| ブランチ | 作業ブランチ → `dev` → リリース PR → `main` | `main` を、手元から手動でデプロイ |

分かっている制約:

- **環境が「ローカル」と「本番」の 2 つしかない。** 動作確認やデザイナーのレビューを、本番か、手元でしかできない。
- 本番の DB は 1 つ。マイグレーションを、本番に直接適用する。事前に試す場所がない。
- 認証・メール・DB の設定が、環境で分かれていない(OAuth アプリは共用、シークレットは本番だけ)。

## 3. 目標の環境

| 環境 | 用途 | 対象のブランチ | web / api | DB | 認証 | メール |
| --- | --- | --- | --- | --- | --- | --- |
| local | 各自の手元の開発 | 作業ブランチ | `vite dev` / `bun run dev` | docker compose の Postgres | 開発用の OAuth アプリ(コールバックは `localhost`) | ログのみ |
| dev | 統合の確認、レビュー、デザイナーの確認(共有) | `dev` | Workers(`ningyoutukai-*-dev`)。`dev` への push で自動デプロイ | 本番とは別の DB(Neon。[D1](#6-決めること)) | dev 用の OAuth アプリ | 実ユーザーに飛ばない(許可リストのみ。[D4](#6-決めること)) |
| production | 本番 | `main` | Workers(`ningyoutukai-*`)。承認つきでデプロイ | Neon の本番 | 本番用の OAuth アプリ | `noreply@mail.maars.dev` |
| (任意) preview | PR ごとの確認 | PR | Workers のプレビュー | Neon のブランチ | dev と共用 | dev と同じ制限 |

## 4. 要件

優先度: **Must**(v2.0 に必須)/ Should(できれば)/ Could(余裕があれば)。

| # | 優先度 | 要件 | 受け入れ条件 |
| --- | --- | --- | --- |
| R1 | Must | **データの分離。** dev の DB は、本番と完全に分ける。接続情報も、Hyperdrive も別 | dev から本番の DB に、どの経路でも接続できない。本番のデータが dev に入る場合は、匿名化(メール・名前)する手順がある |
| R2 | Must | **設定の環境分離。** `wrangler.jsonc` の `env`(`dev`、`production`)で、Worker の名前、vars、バインディング(Hyperdrive、サービスバインディング)を分ける | `wrangler deploy --env dev` と `--env production` が、別の Worker に反映される。dev の web が、dev の api だけに転送する |
| R3 | Must | **認証の分離。** GitHub / Google の OAuth アプリと `BETTER_AUTH_SECRET` を、環境ごとに分ける | local / dev / production のそれぞれでログインでき、他の環境のコールバックを書き換えない。コールバック URL の一覧が文書にある |
| R4 | Must | **メールの安全。** local / dev から、実在のユーザーにメールが送られない | dev で招待・通知を起こしても、許可リスト以外には送られない。件名に環境名(`[dev]`)が付く |
| R5 | Must | **デプロイの自動化。** `dev` への push で dev に自動デプロイ。`main` への反映は、承認つきで production にデプロイ | デプロイの履歴が GitHub に残る。失敗したとき、前のバージョンに戻せる手順がある。シークレットはリポジトリに置かない |
| R6 | Must | **マイグレーションの順序。** dev に先に適用して確認し、そのあと production に適用する | `migrate.yml` が環境を選べる。production への適用は承認が要る。破壊的な変更(列の削除など)の進め方が決まっている |
| R7 | Should | **バックアップの復元訓練。** 本番のダンプを R2 から取り出し、dev(または使い捨ての DB)に復元して確認する | 復元の手順と、確認の結果(行数の一致)が記録されている。定期的に実施する |
| R8 | Should | **dev 環境のアクセス制限。** 公開前の UX 改善を、チームとデザイナーだけに見せる | dev の URL が、許可した人だけに開く([D3](#6-決めること)) |
| R9 | Should | **環境の見分け。** 画面に環境名のバッジ(DEV など)を出す。環境名を返すヘルスチェックがある | dev と production を、画面と API で見分けられる |
| R10 | Should | **ログと障害の把握。** 環境ごとに Worker のログを見られる。エラーの通知先がある | `wrangler tail` や Workers Logs の見方が手順書にある |
| R11 | Could | **PR ごとのプレビュー環境。** Neon のブランチと、Workers のプレビューで、PR ごとに確認できる | PR を閉じると、ブランチが削除される |
| R12 | Must | **費用を無料枠に収める。** 追加の費用が出る項目は、事前に費用を示して確認する | 構成の各項目に、費用の目安と、無料枠の上限が書かれている |
| R13 | Must | **手順書の更新。** 環境の作り方、デプロイ、マイグレーション、復元、ロールバックを、環境ごとに手順書にする | 新しい人が、手順書だけで dev 環境を構築できる |

## 5. 作業の分け方(案)

各フェーズの成果は、`dev` に向けた PR にする。ブランチ名は `v2` を付ける。

| フェーズ | 内容 | ブランチ名の例 | 完了の条件 |
| --- | --- | --- | --- |
| 0. 設計の確定 | この文書のレビュー。[決めること](#6-決めること)を決める | `docs/v2/development-requirements` | D1〜D6 が決まる |
| 1. 設定の分離 | `wrangler.jsonc` の `env`、環境変数の整理(R2) | `infra/v2/wrangler-envs` | `--env dev` / `--env production` の `--dry-run` が通る |
| 2. dev 環境の構築 | Neon の dev、Hyperdrive、Workers の dev、dev 用の OAuth アプリ、メールの制限(R1、R3、R4) | `infra/v2/dev-environment` | dev の URL でログインでき、本番に影響がない |
| 3. デプロイの自動化 | `dev` への push で dev に自動デプロイ、production は承認つき、`migrate.yml` の環境対応(R5、R6) | `ci/v2/deploy-pipeline` | 一連の流れが、実際に動く |
| 4. 運用 | 復元訓練、環境バッジ、ログ、アクセス制限、手順書(R7〜R10、R13) | `infra/v2/runbook`、`feat/v2/env-badge` | 手順書だけで、dev を再構築できる |

## 6. 決めること

| # | 論点 | 選択肢 | 提案 |
| --- | --- | --- | --- |
| D1 | dev の DB | (a) 本番とは別の Neon プロジェクト(空 + 初期データ) (b) 同じプロジェクトの別ブランチ(本番から分岐) | **(a)**。(b) は本番のデータ(メール・名前)を丸ごと引き継ぐため、匿名化が要る。(a) なら個人情報が入らず、単純。Neon の無料枠はプロジェクト数にも余裕がある。プレビュー(R11)だけ、ブランチを使う |
| D2 | dev の URL | (a) `workers.dev` のまま(`ningyoutukai-web-dev.<サブドメイン>.workers.dev`) (b) `maars.dev` のサブドメイン(例 `dev.ningyoutukai.maars.dev`) | **(a) から始める。** 本番も `workers.dev` で動いている(Google のログインも通っている)。ドメインを付けるのは、環境の分離が済んでから(OAuth の登録の更新が要る) |
| D3 | dev のアクセス制限 | (a) 制限なし (b) Cloudflare Access(ワンタイムメールなど。無料枠あり、要確認) (c) 簡易認証 | **(b)。** 未公開の UX 改善を見せる環境なので、制限したい。ただし OAuth のコールバックと両立するか、検証が要る |
| D4 | dev のメール | (a) ログのみ (b) 許可リストの宛先だけに送る (c) 送信ドメインを分ける | **(b)** + 件名に `[dev]`。動作の確認には、実際に届くことが要る。許可リストは環境変数で管理 |
| D5 | CI/CD の方式 | (a) GitHub Actions + `wrangler`(API トークン) (b) Cloudflare の Workers Builds(Git 連携) | **(a)。** すでに GitHub Actions を使っており、マイグレーションとの順序、承認(GitHub の Environment)を一か所で組める。プランによっては Environment の承認に制約があるため、要確認 |
| D6 | v2.0 に含める機能 | [申し送り](../v2-todo.md)(ユーザーテーブルの統一、担当者の再割り振り、完了後の修正)、[要件定義 5 章](../requirements.md)(進行確認、ステータス、オンライン状態) | **環境の分離が終わってから決める**(v2.1 以降)。環境が分かれていれば、機能追加を dev で安全に試せる |

## 7. 完了の定義(v2.0)

- R1〜R6、R12、R13(Must)が満たされている。
- dev で、ログイン、プロダクトの作成、招待、タスクの操作が、本番に影響を与えずにできる。
- `dev` に PR をマージすると dev に反映され、`main` にまとめると、承認を経て production に反映される。
- 本番のマイグレーションは、dev で一度通ったものだけを適用している。

## 参考

- [infra.md](../infra.md): 本番のインフラ構成
- [deploy.md](../deploy.md): 本番デプロイの手順書
- [oauth-setup.md](../oauth-setup.md): OAuth アプリの設定手順
- [requirements.md](../requirements.md): 要件定義(5 章: 今後の展開)
- [v2-todo.md](../v2-todo.md): v2 に向けた申し送り
