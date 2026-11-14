import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { app } from "../../src/app";
import { cleanup, insertTask, setupProduct } from "../task/helpers";

// GET /api/product の pendingReviewCount: 確認待ち(完了報告済みで、まだ完了になっていない)の数。リーダーのプロダクトだけ。メンバーは null

type Setup = Awaited<ReturnType<typeof setupProduct>>;
type Item = { productId: string; role: string; pendingReviewCount: number | null };
let a: Setup;

beforeAll(async () => {
  a = await setupProduct({ members: 2 });
});
afterAll(async () => {
  await cleanup();
});

const list = async (cookie: string) =>
  (await (await app.handle(new Request("http://localhost/api/product", { headers: { cookie } }))).json()) as Item[];
const mine = async (cookie: string) => (await list(cookie)).find((p) => p.productId === a.productId)!;

describe("確認待ちの数(pendingReviewCount)", () => {
  test("報告がなければ、リーダーは 0", async () => {
    expect((await mine(a.leader.cookie)).pendingReviewCount).toBe(0);
  });

  test("報告済みで、完了になっていないタスクだけを数える(全メンバー分)", async () => {
    const now = new Date();
    await insertTask(a.members[0]!.memberId, { reportedAt: now });
    await insertTask(a.members[1]!.memberId, { reportedAt: now });
    await insertTask(a.leader.memberId, { reportedAt: now });
    await insertTask(a.members[0]!.memberId); // 未報告
    await insertTask(a.members[0]!.memberId, { reportedAt: now, completedAt: now }); // 完了済み
    expect((await mine(a.leader.cookie)).pendingReviewCount).toBe(3);
  });

  test("メンバーのプロダクトでは null(確認するのはリーダー)。数も漏れない", async () => {
    const item = await mine(a.members[0]!.cookie);
    expect(item.role).toBe("member");
    expect(item.pendingReviewCount).toBeNull();
  });

  test("別のプロダクトの報告は、数えない", async () => {
    const b = await setupProduct({ members: 1 });
    await insertTask(b.members[0]!.memberId, { reportedAt: new Date() });
    expect((await mine(a.leader.cookie)).pendingReviewCount).toBe(3);
    const other = (await list(b.leader.cookie)).find((p) => p.productId === b.productId)!;
    expect(other.pendingReviewCount).toBe(1);
  });
});
