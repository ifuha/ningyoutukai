import { afterAll, afterEach, beforeAll, describe, expect, spyOn, test } from "bun:test";
import { eq } from "drizzle-orm";
import { db } from "../../src/db";
import { users } from "../../src/db/schema";
import { mailer } from "../../src/lib/mailer";
import {
  accept,
  cleanup,
  createInvitee,
  createOutsider,
  inviteTo,
  invitationsOf,
  list,
  setupProduct,
  uniq,
  type Ctx,
} from "./helpers";

/**
 * 実装の不具合の再現。いまは「失敗することを期待する」テスト(test.failing)なので緑になる。
 * 実装が直ると、このテストが赤になる(= test.failing を test に変える合図)。
 */

let p: Ctx;
const sendSpy = spyOn(mailer, "send");
const invite = (body: unknown) => inviteTo(p.productId, p.leader.cookie, body);
const idOf = async (res: Response) => ((await res.json()) as { invitationId: string }).invitationId;

beforeAll(async () => {
  p = await setupProduct({ members: 0 });
  sendSpy.mockResolvedValue({ ok: true });
});
afterEach(() => sendSpy.mockReset().mockResolvedValue({ ok: true }));
afterAll(async () => {
  sendSpy.mockRestore();
  await cleanup();
});

describe("既知の不具合", () => {
  // 不具合 1: 同時に同じ相手を招待すると、保留中の招待が重複する(スキーマに unique 制約がなく、
  // 「重複の確認 → insert」が 1 つのトランザクション・ロックで守られていない)
  test.failing("同じ相手への同時の招待で、保留中の招待が 2 つ以上できない", async () => {
    const email = `race-${uniq()}@example.com`;
    const results = await Promise.all(Array.from({ length: 20 }, () => invite({ email })));
    expect(results.filter((r) => r.status === 201).length).toBe(1);
    const pending = (await invitationsOf(p.productId)).filter(
      (i) => i.inviteeIdentifier === email && i.status === "pending"
    );
    expect(pending.length).toBe(1);
  });

  // 不具合 2: 招待先に NUL 文字(\u0000)を含めると、PostgreSQL がエラーにして 500 になる(422 などにすべき)
  test.failing("githubId に NUL 文字を含めても 500 にならない", async () => {
    const res = await invite({ githubId: `nul\u0000-${uniq()}` });
    expect(res.status).toBeLessThan(500);
  });
  test.failing("email に NUL 文字を含めても 500 にならない", async () => {
    const res = await invite({ email: `nul\u0000-${uniq()}@example.com` });
    expect(res.status).toBeLessThan(500);
  });
  // 不具合 3: mailer.send が例外を投げると、招待はすでに保存されているのに 500 を返す
  // (mailer は例外を投げない設計だが、呼び出し側で守っていない。再試行すると 409 になる)
  test.failing("mailer.send が例外を投げても、招待は 201 で成功する", async () => {
    sendSpy.mockRejectedValue(new Error("boom"));
    const res = await invite({ email: `throw-${uniq()}@example.com` });
    expect(res.status).toBe(201);
  });

  // 不具合 4: GitHub username に @ を付けて招待すると(@octocat)、登録済みの octocat さんに届かない
  // (識別子が「@octocat」のまま保存され、user_id も結びつかず、users.github_id との照合にも失敗する)
  test.failing("githubId に @ を付けても、登録済みの人に届く", async () => {
    const gh = `at-${uniq()}`;
    const u = await createInvitee(gh);
    const res = await invite({ githubId: `@${gh}` });
    expect(res.status).toBe(201);
    expect(((await (await list(u.cookie)).json()) as unknown[]).length).toBe(1);
  });

  // 不具合 5: 未登録のメールで招待(user_id = null)した人が、その後に登録してから、GitHub username で
  // もう一度招待されると、保留中の招待が重複する(重複の確認が、未登録時の招待先と照合できていない)
  test.failing("未登録時にメールで招待した人を、登録後に GitHub username で招待しても、重複しない", async () => {
    const gh = `after-${uniq()}`;
    const o = await createOutsider();
    expect((await invite({ email: o.email })).status).toBe(201); // 未登録: user_id = null
    expect((await list(o.cookie)).status).toBe(200); // ログイン = users の行ができる
    await db.update(users).set({ githubId: gh }).where(eq(users.email, o.email));
    const second = await invite({ githubId: gh });
    expect(second.status).toBe(409);
  });
});
