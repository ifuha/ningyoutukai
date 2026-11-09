import { t, type Static } from "elysia";

/**
 * ツリー表示 API のレスポンスの形。
 * スキーマを 1 か所で書き、型(`Static`)・レスポンスの検証・Swagger の表示のすべてに使う。
 */

// DB の Date は、JSON になると ISO 文字列になる
const nullableDate = t.Union([t.Date(), t.Null()]);

export const TreeTaskSchema = t.Object({
  taskId: t.String(),
  taskName: t.String(),
  description: t.Union([t.String(), t.Null()]),
  timeLimit: nullableDate,
  reportedAt: nullableDate,
  isVisible: t.Boolean(),
  taskType: t.Union([
    t.Object({ taskTypeId: t.String(), taskTypeName: t.String() }),
    t.Null(),
  ]),
});

// メンバー(人)の下に出す、その人の AI のカード。AI はメンバーではなく、持ち主が使う道具(トークンごとに 1 枚)
export const TreeAiSchema = t.Object({
  tokenId: t.String(),
  name: t.String(),
  // 見ている人自身のトークンか(自分のトークンだけ、画面から取り消せる)
  mine: t.Boolean(),
  // このプロダクトで、最後に下書きを出した日時(なければ null)
  lastDraftAt: nullableDate,
  // 確認待ちの下書きの数。持ち主本人にだけ数を返す(他の人には null)
  pendingCount: t.Union([t.Number(), t.Null()]),
  // 確認待ちの下書きがあるタスクの ID(古い下書きから順。持ち主本人にだけ返す。他の人には null)
  pendingTaskIds: t.Union([t.Array(t.String()), t.Null()]),
  // カードの位置: 初めの置き場所(リーダーは右、メンバーは下)からのずれ(px)。動かしていなければ null
  offsetX: t.Union([t.Number(), t.Null()]),
  offsetY: t.Union([t.Number(), t.Null()]),
});

export const TreeNodeSchema = t.Object({
  productMemberId: t.String(),
  userId: t.String(),
  userName: t.String(),
  avatarUrl: t.Union([t.String(), t.Null()]),
  role: t.Union([t.Literal("leader"), t.Literal("member")]),
  // セクション(F1)。所属するセクションの ID(無所属は null)と、カードの自由な位置(null は自動配置)
  sectionId: t.Union([t.String(), t.Null()]),
  positionX: t.Union([t.Number(), t.Null()]),
  positionY: t.Union([t.Number(), t.Null()]),
  tasks: t.Array(TreeTaskSchema),
  ais: t.Array(TreeAiSchema),
});

export const ProductTreeSchema = t.Object({
  product: t.Object({ productId: t.String(), productName: t.String(), avatarUrl: t.Union([t.String(), t.Null()]) }),
  leader: t.Union([TreeNodeSchema, t.Null()]),
  members: t.Array(TreeNodeSchema),
  // 呼び出したユーザー自身の productMemberId(自分のタスクかどうかを、画面が判断するために使う)
  viewerProductMemberId: t.String(),
});

export type TreeTask = Static<typeof TreeTaskSchema>;
export type TreeAi = Static<typeof TreeAiSchema>;
export type TreeNode = Static<typeof TreeNodeSchema>;
export type ProductTree = Static<typeof ProductTreeSchema>;
