import { config } from "dotenv";

/**
 * 環境変数のファイルを読み込む(`db/index.ts`、`auth.ts`、`drizzle.config.ts` が最初に import する)。
 *
 * 優先順位(上が勝つ):
 *   1. シェルの環境変数(すでに `process.env` にある値。空文字も「ある」扱い)
 *   2. `.env.local`(ローカル開発用。コミットしない)
 *   3. `.env`(共通。コミットしない)
 *
 * dotenv は、パスを配列で渡すと順に読み、**先に読んだ値が勝つ**(`override` を付けない既定)。
 * 既にある値は上書きしない。空文字(`KEY=`)も値として扱うので、`.env.local` で `RESEND_API_KEY=` と
 * 空にすれば、`.env` にキーがあっても空のまま(= メールを送らない)になる。
 * ファイルが無くてもエラーにしない。`dir` の既定は実行時のカレントディレクトリ(api/)。
 */
export function loadEnv(
  processEnv: Record<string, string | undefined> = process.env,
  dir = ".",
): void {
  config({
    path: [`${dir}/.env.local`, `${dir}/.env`],
    processEnv: processEnv as Record<string, string>,
    quiet: true,
  });
}

loadEnv();
