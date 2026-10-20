/**
 * 全テストの前に、1 回だけ実行される(bunfig.toml の preload)。
 *
 * Bun は全テストファイルを 1 つのプロセスで実行し、読み込んだモジュールを使い回す。
 * そのため、`src/auth.ts`(better-auth)は、どのテストファイルが最初に読み込んだかで設定が決まり、
 * テストファイルの実行順によって結果が変わってしまう(外部認証のテストだけが落ちる、など)。
 * ここで環境変数を先にそろえて、どの順でも同じ `auth` になるようにする。
 */

// 外部認証のプロバイダを有効にする(実際の OAuth 通信はしない。認可 URL を作るだけ)
process.env.GITHUB_CLIENT_ID = "test-github-client-id";
process.env.GITHUB_CLIENT_SECRET = "test-github-client-secret";
process.env.GOOGLE_CLIENT_ID = "test-google-client-id";
process.env.GOOGLE_CLIENT_SECRET = "test-google-client-secret";
process.env.BETTER_AUTH_URL ??= "http://localhost:3001";
process.env.WEB_ORIGIN ??= "http://localhost:3000";

// better-auth は NODE_ENV=test(bun test の既定)だと、Origin / callbackURL の検証をスキップする。
// 本番と同じく検証が働く状態にするため、最初の読み込みの前に development にしておく。
// (better-auth は NODE_ENV を、最初に読み込んだときの 1 回しか見ない)
process.env.NODE_ENV = "development";
