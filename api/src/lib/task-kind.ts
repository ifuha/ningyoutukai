import { t } from "elysia";
import { taskTypes } from "../db/schema";

/** タスクの種類の入力検証・共通の定義(追加・編集で共通)。 */

export const TASK_KIND_NAME_MAX = 50;

// Postgres の text は NUL 文字(\u0000)を保存できず、500 になるため、入力の時点で弾く
const NO_NUL = "^[^\\u0000]*$";

export const taskKindNameSchema = () =>
  t.String({ maxLength: TASK_KIND_NAME_MAX, pattern: NO_NUL });

export const taskKindColumns = {
  taskTypeId: taskTypes.taskTypeId,
  taskTypeName: taskTypes.taskTypeName,
  productId: taskTypes.productId,
};

export const taskKindSchema = () =>
  t.Object({
    taskTypeId: t.String(),
    taskTypeName: t.String(),
    productId: t.String(),
  });

export const messageSchema = () => t.Object({ message: t.String() });

// PostgreSQL の unique 制約違反
const UNIQUE_VIOLATION = "23505";

export function isUniqueViolation(e: unknown) {
  const err = e as { code?: string; cause?: { code?: string } };
  return err?.code === UNIQUE_VIOLATION || err?.cause?.code === UNIQUE_VIOLATION;
}
