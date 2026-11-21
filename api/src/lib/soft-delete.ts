import { isNull } from "drizzle-orm";
import { Elysia } from "elysia";
import { productNotes, sections } from "../db/schema";

// soft delete(`deletedAt`。まとめて削除で入る)の判定を、1 か所にまとめる(セクション・メモ)。
// - 「生きている行」の条件(`liveSection` / `liveNote`)を、検索の where に足す。soft delete 中の行は、見つからない行と同じになる
// - soft delete 中のとき何を返すか(404 / 422 など)は、各エンドポイントが、いまの「見つからない」ときと同じ返し方で決める
// - soft delete 中の行は、10 分のあいだ戻せるよう、名前の一意制約と、メンバーの所属(section_id)を、そのまま残す。
//   期限が過ぎたら、定期実行(`soft-delete-cleanup.ts`)が物理削除する
export const liveSection = isNull(sections.deletedAt);
export const liveNote = isNull(productNotes.deletedAt);

/** ルートから `softDelete.liveSection` / `softDelete.liveNote` で使えるようにするプラグイン(`note-authorize.ts` と同じ形) */
export const softDelete = new Elysia({ name: "soft-delete" }).decorate("softDelete", { liveSection, liveNote });
