# API 設計書

## ログイン

| メソッド・エンドポイント | 名称 | 説明 |
| --- | --- | --- |
| **POST** `/api/auth/sign-in/social` | 外部認証 | GitHubまたはGoogleによるログイン・初回登録を行う |
| **GET** `/api/auth/callback/github` | GitHub認証 | GitHubからの認証結果を受け取る |
| **GET** `/api/auth/callback/google` | Google認証 | Googleからの認証結果を受け取る |
| **GET** `/api/auth/get-session` | ログイン状態取得 | 現在ログインしているユーザーの情報を取得する |
| **POST** `/api/auth/sign-out` | ログアウト | ログイン中のユーザーのセッションを終了する |
| **GET** `/api/calendar/status` | Googleカレンダー連携状態 | ログイン中のユーザーがカレンダー権限を許可済みか取得する |

## プロダクト作成

| メソッド・エンドポイント | 名称 | 説明 |
| --- | --- | --- |
| **POST** `/api/product` | プロダクト作成 | プロダクト名を入力して新規作成する。作成者は自動的にプロダクトリーダーになる |
| **GET** `/api/product` | プロダクト一覧取得 | ログイン中のユーザーが所属するプロダクトの一覧を取得する |
| **GET** `/api/product/{productId}` | 指定したプロダクトを取得 | 指定したプロダクトの情報を取得する |
| **PATCH** `/api/product/{productId}` | プロダクト情報変更 | プロダクト名などを変更する（追加候補） |
| **DELETE** `/api/product/{productId}` | 指定したプロダクトを削除 | プロダクトリーダーが指定したプロダクトを削除する |

## プロダクト内の機能

#### メンバーの管理

| メソッド・エンドポイント | 名称 | 説明 |
| --- | --- | --- |
| **POST** `/api/product/{productId}/invitation` | メンバー招待 | GitHubのusernameまたはメールアドレスを入力してユーザーを招待する |
| **GET** `/api/invitation` | 招待一覧取得 | ログイン中のユーザーに届いている招待の一覧を取得する |
| **POST** `/api/invitation/{invitationId}/accept` | 招待承認 | 指定した招待を承認し、プロダクトに参加する |
| **POST** `/api/invitation/{invitationId}/reject` | 招待拒否 | 指定した招待を拒否する |
| **GET** `/api/product/{productId}/member` | メンバー一覧取得 | 指定したプロダクトに所属しているメンバーの一覧を取得する |
| **GET** `/api/product/{productId}/member/{memberId}` | メンバー情報取得 | 指定したメンバーの情報を取得する |

#### タスク機能

| メソッド・エンドポイント | 名称 | 説明 |
| --- | --- | --- |
| **POST** `/api/product/{productId}/task` | タスクを追加 | タイトル、説明、期限日時、種類、担当者、公開設定を指定してタスクを作成する。担当者がカレンダー連携済みの場合、その人のGoogleカレンダーへ開始・終了を期限時刻にそろえた予定を追加する |
| **GET** `/api/product/{productId}/task` | タスク一覧取得 | 指定したプロダクト内の閲覧可能なタスク一覧を取得する |
| **GET** `/api/product/{productId}/task/{taskId}` | 指定したタスクを取得 | 指定したタスクの詳細情報を取得する |
| **GET** `/api/product/{productId}/member/{memberId}/task` | 指定したメンバーのタスクを取得 | 指定したメンバーに割り振られているタスクの一覧を取得する |
| **PATCH** `/api/product/{productId}/task/{taskId}` | タスク情報変更 | タスクのタイトル、説明、期限、公開設定などを変更する |
| **POST** `/api/product/{productId}/task/{taskId}/complete-report` | タスク完了報告 | 担当メンバーがリーダーに完了を報告する。Resend APIを使用してメール通知する |
| **PATCH** `/api/product/{productId}/task/{taskId}/complete` | タスク完了確定 | プロダクトリーダーが確認後、タスクを完了状態に変更する |

#### メッセージ

| メソッド・エンドポイント | 名称 | 説明 |
| --- | --- | --- |
| **GET** `/api/product/{productId}/task/{taskId}/message` | メッセージ履歴取得 | タスクのメッセージを古い順に取得する。タスクを見られる人（公開タスクはメンバー全員、非公開タスクはリーダーと担当者）は読める。削除済みのメッセージは本文が空で `deleted: true` になる |

#### タスクの種類

| メソッド・エンドポイント | 名称 | 説明 |
| --- | --- | --- |
| **POST** `/api/product/{productId}/task_kinds` | タスクの種類を追加 | プロダクトリーダーがデザインやコーディングなどのタスク種類を追加する |
| **GET** `/api/product/{productId}/task_kinds` | タスクの種類一覧取得 | プロダクト内で登録されているタスクの種類を取得する |
| **PATCH** `/api/product/{productId}/task_kinds/{kindId}` | タスクの種類を編集 | 登録済みのタスク種類の名称を変更する（追加候補） |
| **PATCH** `/api/product/{productId}/task/{taskId}/task_kinds/{kindId}` | タスクに種類を割り当てる | 指定したタスクに種類を設定・変更する |

#### セクション機能（v2.0 の F1）

作成・更新・削除・メンバーのカードの移動は、**プロダクトリーダーのみ**（メンバーは自分のカードも動かせない。403）。一覧は、プロダクトのメンバーなら誰でも取得できる。所属していないプロダクト・そのプロダクトに無いセクションやメンバーは、存在を漏らさないよう 404。同じ名前のセクションがすでにあると 409、入力が不正だと 422。

| メソッド・エンドポイント | 名称 | 説明 |
| --- | --- | --- |
| **GET** `/api/product/{productId}/section` | セクション一覧取得 | プロダクトのセクションを名前順で取得する。各セクションに、位置（`x`・`y`）、大きさ（`width`・`height`）、色、所属するメンバーの `productMemberId`（`memberIds`）を付ける |
| **POST** `/api/product/{productId}/section` | セクション作成 | 名前（前後の空白を取り除いて 1〜50 文字、プロダクト内で一意）、色（`red` / `yellow` / `green` / `purple` / `lightblue` / `blue`）を指定する。位置と大きさは省略でき、既定は `x=0`・`y=0`・300×400。座標の絶対値は 1,000,000 以下、幅と高さは 0 より大きく 100,000 以下。201 を返す |
| **PATCH** `/api/product/{productId}/section/{sectionId}` | セクション更新 | 名前・色・位置・大きさを一部だけ変更する（1 つも指定しないと 422）。**位置（`x`・`y`）を変えると、そのセクションに所属するメンバーのうち位置を持つカードが、同じ差分だけ一緒に動く**（セクションの更新とカードの移動は同じトランザクション。動かした先が座標の上限を超えるカードがあれば 422）。大きさの変更では、カードは動かない |
| **DELETE** `/api/product/{productId}/section/{sectionId}` | セクション削除 | セクションを削除する。所属していたメンバーは無所属に戻り、メンバーとカードの位置は残る。204 を返す |
| **PATCH** `/api/product/{productId}/member/{memberId}/position` | カードの移動 | 位置（`positionX`・`positionY`、必須）と、所属するセクション（`sectionId`）を変更する。`sectionId` を省略すると所属は変えず、`null` で無所属に戻す。**指定した `sectionId` は、同じプロダクトのセクションかを API が必ず確かめる**（DB は保証しない）。別のプロダクトのセクション・存在しないセクションは 422 |

#### 削除

| メソッド・エンドポイント | 名称 | 説明 |
| --- | --- | --- |
| **DELETE** `/api/product/{productId}/task_kinds/{kindId}` | 指定したタスクの種類を削除する | プロダクトリーダーが登録済みのタスク種類を削除する |
| **DELETE** `/api/product/{productId}/member/{memberId}` | 指定したメンバーを削除する | プロダクトからメンバーを削除する。要件に従い紐づくタスクも削除する |
| **DELETE** `/api/product/{productId}` | 指定したプロダクトを削除する | プロダクトリーダーが指定したプロダクトを削除する |
| **DELETE** `/api/product/{productId}/task/{taskId}` | 指定したタスクを削除する | プロダクトリーダーが指定したタスクを削除する |

## ツリー表示（追加候補）

| メソッド・エンドポイント | 名称 | 説明 |
| --- | --- | --- |
| **GET** `/api/product/{productId}/tree` | プロダクト構造取得 | リーダー、メンバー、割り振られたタスク、タスク種類をツリー表示用のデータとして取得する。呼び出したユーザー自身の `viewerProductMemberId` も返す。各メンバー（リーダーを含む）に、所属するセクションの `sectionId`（無所属は `null`）と、カードの位置 `positionX`・`positionY`（`null` は自動配置）も付ける |
