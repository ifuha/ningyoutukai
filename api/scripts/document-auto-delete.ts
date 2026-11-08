import "../src/lib/load-env";
import { documentStorage } from "../src/lib/storage";
import { runDocumentAutoDelete } from "../src/lib/document-auto-delete";

// 文書の自動削除を、手元で 1 回実行する(ローカルの確認用)。本番は、定期実行(Cloudflare の Cron Trigger。src/worker.ts)が行う。
// 使い方: bun run scripts/document-auto-delete.ts   (api ディレクトリで。DATABASE_URL は .env.local / .env を読む)
const results = await runDocumentAutoDelete(documentStorage);
if (results.length === 0) console.log("削除した文書はありません");
for (const r of results) {
  console.log(`プロダクト「${r.productName}」(${r.days} 日): ${r.deleted.length} 件を削除`);
  for (const d of r.deleted) console.log(`  - ${d.directoryName}/${d.name}`);
}
process.exit(0);
