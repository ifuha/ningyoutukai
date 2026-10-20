// ツリー表示用データの組み立て。DB には触らない純粋関数。

export type MemberRow = {
  productMemberId: string;
  userId: string;
  role: string; // "leader" | "member"（role の値はチームで確定させる）
  userName: string;
  avatarUrl: string | null;
};

export type TaskRow = {
  taskId: string;
  taskName: string;
  description: string | null;
  timeLimit: Date | string | null;
  reportedAt: Date | string | null;
  isVisible: boolean;
  productMemberId: string;
  taskTypeId: string | null;
  taskTypeName: string | null;
};

export type TreeTask = {
  taskId: string;
  taskName: string;
  description: string | null;
  timeLimit: Date | string | null;
  reportedAt: Date | string | null;
  isVisible: boolean;
  taskType: { taskTypeId: string; taskTypeName: string } | null;
};

export type TreeNode = {
  productMemberId: string;
  userId: string;
  userName: string;
  avatarUrl: string | null;
  role: string;
  tasks: TreeTask[];
};

export type ProductTree = {
  product: { productId: string; productName: string };
  leader: TreeNode | null;
  members: TreeNode[];
};

export function buildTree(
  product: { productId: string; productName: string },
  memberRows: MemberRow[],
  taskRows: TaskRow[],
): ProductTree {
  // メンバーごとにタスクをまとめる（入力の並び順を保つ）
  const tasksByMember = new Map<string, TreeTask[]>();
  for (const row of taskRows) {
    const task: TreeTask = {
      taskId: row.taskId,
      taskName: row.taskName,
      description: row.description,
      timeLimit: row.timeLimit,
      reportedAt: row.reportedAt,
      isVisible: row.isVisible,
      taskType:
        row.taskTypeId && row.taskTypeName
          ? { taskTypeId: row.taskTypeId, taskTypeName: row.taskTypeName }
          : null,
    };
    const list = tasksByMember.get(row.productMemberId);
    if (list) list.push(task);
    else tasksByMember.set(row.productMemberId, [task]);
  }

  const nodes: TreeNode[] = memberRows.map((m) => ({
    productMemberId: m.productMemberId,
    userId: m.userId,
    userName: m.userName,
    avatarUrl: m.avatarUrl,
    role: m.role,
    tasks: tasksByMember.get(m.productMemberId) ?? [],
  }));

  // リーダーは最上部に1人。想定外に複数いても、2人目以降は members に入れて落とさない
  const leaderIndex = nodes.findIndex((n) => n.role === "leader");
  const leader = leaderIndex >= 0 ? nodes[leaderIndex] : null;
  const members = nodes.filter((_, i) => i !== leaderIndex);

  return { product, leader, members };
}