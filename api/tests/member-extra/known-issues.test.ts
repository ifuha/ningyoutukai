import { afterAll, expect, test } from "bun:test";
import { cleanup, itemUrl, request, setupProduct } from "./helpers";

afterAll(cleanup);

/**
 * 既知の不具合の再現。`test.failing` は「失敗することを期待する」テストなので、
 * いまは緑(期待どおり失敗)。実装が直ると赤になるので、そのとき `test.failing` を `test` に変える。
 */

// 重大度: 低。順番に 2 回消すと 2 回目は 404 だが、同時に 2 回消すと両方 204 になることが多い。
// 原因の見当: delete-member.ts が「存在確認の select」と「delete」を別々に行い、
// 削除件数(0 件なら 404)を見ていない。
test.failing("同じメンバーを同時に 2 回削除したとき、204 は 1 回だけで、もう一方は 404 になる", async () => {
  for (let round = 0; round < 6; round++) {
    const { productId, leader, members } = await setupProduct();
    const results = await Promise.all(
      [0, 1].map(() =>
        request("DELETE", itemUrl(productId, members[0]!.memberId), { cookie: leader.cookie })
      )
    );
    expect(results.map((r) => r.status).sort()).toEqual([204, 404]);
  }
});
