import { Elysia } from "elysia";
import { createSection } from "./create-section";
import { listSections } from "./list-sections";
import { updateSection } from "./update-section";

/**
 * セクション機能(F1)の API。
 * 作成・更新・削除・メンバーの移動は、リーダーのみ。一覧は、プロダクトのメンバーなら誰でも。
 * エンドポイントごとにファイルを分けている。
 */
export const sectionRoutes = new Elysia({ name: "section-routes" })
  .use(listSections)
  .use(createSection)
  .use(updateSection);
