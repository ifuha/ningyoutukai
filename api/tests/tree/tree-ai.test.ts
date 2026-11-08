import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { eq } from "drizzle-orm";
import { app } from "../../src/app";
import { db } from "../../src/db";
import { aiTokens, taskReportDrafts } from "../../src/db/schema";
import { createAiToken } from "../../src/lib/ai-token";
import { cleanup, insertTask, setupProduct } from "../task/helpers";

// ツリーに出る、メンバーの AI のカード(有効なトークンごとに 1 枚。確認待ちの数は持ち主だけに返す)

type Setup = Awaited<ReturnType<typeof setupProduct>>;
type Ai = { tokenId: string; name: string; lastDraftAt: string | null; pendingCount: number | null };
type Tree = { leader: { ais: Ai[] }; members: { productMemberId: string; ais: Ai[] }[] };

let a: Setup;
let memberTokenId: string;
let revokedId: string;

beforeAll(async () => {
  a = await setupProduct({ members: 2 });
  memberTokenId = (await createAiToken(a.members[0]!.userId, "メンバーの AI", 30)).row.tokenId;
  revokedId = (await createAiToken(a.members[0]!.userId, "取り消した AI", 30)).row.tokenId;
  await db.update(aiTokens).set({ revokedAt: new Date() }).where(eq(aiTokens.tokenId, revokedId));
  await createAiToken(a.members[0]!.userId, "期限切れの AI", 30).then((t) =>
    db.update(aiTokens).set({ expiresAt: new Date(Date.now() - 1000) }).where(eq(aiTokens.tokenId, t.row.tokenId)),
  );
  await createAiToken(a.leader.userId, "リーダーの AI", 30);
});
afterAll(async () => {
  await cleanup();
});

const tree = async (cookie: string) =>
  (await (await app.handle(new Request(`http://localhost/api/product/${a.productId}/tree`, { headers: { cookie } }))).json()) as Tree;

describe("AI のカード", () => {
  test("メンバーの AI はそのメンバーの下、リーダーの AI はリーダーに付く。取り消した・期限切れのトークンは出ない", async () => {
    const t = await tree(a.leader.cookie);
    expect(t.leader.ais.map((x) => x.name)).toEqual(["リーダーの AI"]);
    const mine = t.members.find((m) => m.productMemberId === a.members[0]!.memberId)!;
    expect(mine.ais.map((x) => x.name)).toEqual(["メンバーの AI"]);
    const other = t.members.find((m) => m.productMemberId === a.members[1]!.memberId)!;
    expect(other.ais).toEqual([]);
  });

  test("下書きがなければ、最後の日時は null、確認待ちは 0(持ち主本人)/ null(他の人)", async () => {
    const own = (await tree(a.members[0]!.cookie)).members.find((m) => m.productMemberId === a.members[0]!.memberId)!.ais[0]!;
    expect(own.lastDraftAt).toBeNull();
    expect(own.pendingCount).toBe(0);
    const seenByLeader = (await tree(a.leader.cookie)).members.find((m) => m.productMemberId === a.members[0]!.memberId)!.ais[0]!;
    expect(seenByLeader.pendingCount).toBeNull();
  });

  test("下書きが出ると、最後の日時が入る。確認待ちの数は持ち主にだけ見え、却下すると減る", async () => {
    const task = await insertTask(a.members[0]!.memberId);
    const [d1] = await db.insert(taskReportDrafts).values({ taskId: task!.taskId, aiTokenId: memberTokenId, aiName: "メンバーの AI", body: "1" }).returning();
    await db.insert(taskReportDrafts).values({ taskId: task!.taskId, aiTokenId: memberTokenId, aiName: "メンバーの AI", body: "2" });
    const own = (await tree(a.members[0]!.cookie)).members.find((m) => m.productMemberId === a.members[0]!.memberId)!.ais[0]!;
    expect(own.pendingCount).toBe(2);
    expect(own.lastDraftAt).not.toBeNull();
    const leaderView = (await tree(a.leader.cookie)).members.find((m) => m.productMemberId === a.members[0]!.memberId)!.ais[0]!;
    expect(leaderView.pendingCount).toBeNull();
    expect(leaderView.lastDraftAt).not.toBeNull();

    await db.update(taskReportDrafts).set({ status: "discarded" }).where(eq(taskReportDrafts.draftId, d1!.draftId));
    const after = (await tree(a.members[0]!.cookie)).members.find((m) => m.productMemberId === a.members[0]!.memberId)!.ais[0]!;
    expect(after.pendingCount).toBe(1);
  });
});
