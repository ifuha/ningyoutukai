import { t } from "elysia";
import { sectionColors } from "./section";
import { NO_NUL } from "./validation";

/**
 * セクション API の入力の検証(F1)。
 * 数値は、TypeBox の `Number` が有限の数だけを通す(NaN・Infinity は JSON で送れず、型としても弾かれる)。
 * 座標と大きさの上限は、画面が扱う現実的な範囲に収めるための API の制限で、DB の CHECK は有限であることだけを守る。
 */

export const SECTION_NAME_MAX = 50;
/** 座標(セクションの x・y、カードの位置)の絶対値の上限 */
export const COORD_MAX = 1_000_000;
/** セクションの幅・高さの上限 */
export const SIZE_MAX = 100_000;

// 名前は、前後の空白を取り除いてから 1〜50 文字かを見る(ルートで normalizeSectionName を通す)。
// ここでは、極端に長い入力と NUL 文字(Postgres の text に保存できない)だけを弾く
export const sectionNameSchema = () => t.String({ maxLength: 200, pattern: NO_NUL });
export const sectionColorSchema = () => t.UnionEnum([...sectionColors]);
export const coordSchema = () => t.Number({ minimum: -COORD_MAX, maximum: COORD_MAX });
export const sizeSchema = () => t.Number({ exclusiveMinimum: 0, maximum: SIZE_MAX });

export const SECTION_NAME_ERROR = `セクション名は 1〜${SECTION_NAME_MAX} 文字で入力してください`;

/** 前後の空白を取り除いた名前を返す。空、または 50 文字(コードポイント)を超えるなら null */
export function normalizeSectionName(raw: string): string | null {
  const name = raw.trim();
  const length = [...name].length;
  return length >= 1 && length <= SECTION_NAME_MAX ? name : null;
}
