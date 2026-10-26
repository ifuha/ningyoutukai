import { t, type Static } from "elysia";
import type { SectionColor } from "./section";
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
// 色は、`t.UnionEnum` ではなく Union の Literal で書く。UnionEnum は、省略された値を先頭の値(red)で
// 補う(`default: values[0]`)ので、作成で色を省略しても red で通り、更新で色を送らないと red に戻ってしまう
// (`map` で作ると、TypeBox の静的な型が取れず `never` になるため、リテラルを並べる)
export const sectionColorSchema = () =>
  t.Union([
    t.Literal("red"),
    t.Literal("yellow"),
    t.Literal("green"),
    t.Literal("purple"),
    t.Literal("lightblue"),
    t.Literal("blue"),
  ]);

// 上の一覧が、`sectionColors`(DB の CHECK と同じ一覧)と食い違ったら、ここがコンパイルエラーになる
type ColorSchemaType = Static<ReturnType<typeof sectionColorSchema>>;
const colorListsMatch: [SectionColor] extends [ColorSchemaType]
  ? [ColorSchemaType] extends [SectionColor]
    ? true
    : never
  : never = true;
void colorListsMatch;
export const coordSchema = () => t.Number({ minimum: -COORD_MAX, maximum: COORD_MAX });
export const sizeSchema = () => t.Number({ exclusiveMinimum: 0, maximum: SIZE_MAX });

export const SECTION_NAME_ERROR = `セクション名は 1〜${SECTION_NAME_MAX} 文字で入力してください`;

/** 前後の空白を取り除いた名前を返す。空、または 50 文字(コードポイント)を超えるなら null */
export function normalizeSectionName(raw: string): string | null {
  const name = raw.trim();
  const length = [...name].length;
  return length >= 1 && length <= SECTION_NAME_MAX ? name : null;
}
