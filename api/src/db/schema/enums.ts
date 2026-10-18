import { pgEnum } from "drizzle-orm/pg-core";
 
// プロダクト内の権限(将来ロールが増えたら roles テーブルへの移行を検討)
export const memberRoleEnum = pgEnum("member_role", ["leader", "member"]);
 
// 招待の検索方法
export const inviteeTypeEnum = pgEnum("invitee_type", ["github", "gmail"]);
 
// 招待の状態
export const invitationStatusEnum = pgEnum("invitation_status", [
  "pending", // 返答待ち
  "accepted", // 許可
  "declined", // 拒否
]);
 