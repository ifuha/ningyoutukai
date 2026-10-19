# v2 で対応すること(申し送り)

v1.0 では、API のエンドポイント(`docs/api.md`)とテーブルの設計を変えない方針にしている。そのために残している暫定対応を、v2 でまとめて直す。

## ユーザーテーブルの統一

- **現状**: ユーザーが 2 つのテーブルに分かれている。
  - `user`(better-auth 用。ID は text。`api/src/db/auth-schema.ts`)
  - `users`(アプリ用。ID は uuid。`product_members.user_id` などが参照。`api/src/db/schema/users.ts`)
- **暫定対応**: ログイン中のユーザーを、メールアドレスで `users` の行に対応づけている(`api/src/lib/app-user.ts`)。`users` に行がなければ、初回のリクエスト時に作る。
- **問題点**:
  - メールアドレスを変更すると、対応づけが切れる(別ユーザー扱いになる)。
  - `users.github_id` と `users.google_sub` は、今は使っておらず null のまま。
- **v2 の方針案**: `users` を廃止し、`product_members.user_id` と `product_invitations.user_id` を `user.id`(text)に向ける。GitHub と Google の ID は better-auth の `account` が持つ。
