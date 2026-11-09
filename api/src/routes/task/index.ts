import { Elysia } from "elysia";
import { confirmComplete } from "./confirm-complete";
import { createTask } from "./create-task";
import { getTask } from "./get-task";
import { listMemberTasks } from "./list-member-tasks";
import { listTasks } from "./list-tasks";
import { reportComplete } from "./report-complete";
import { updateTask } from "./update-task";
import { listMessages } from "./list-messages";
import { createMessage } from "./create-message";
import { updateMessage } from "./update-message";
import { deleteMessage } from "./delete-message";
import { assignAssignee } from "./assign-assignee";
import { suggestAssignee } from "./suggest-assignee";
import { reportDraftEndpoints } from "./report-draft";
import { taskDocumentLinks } from "./task-documents";

/**
 * タスク機能の API(docs/api.md「タスク機能」)。
 * エンドポイントごとにファイルを分けている。
 */
export const taskRoutes = new Elysia({ name: "task-routes" })
  .use(createTask)
  .use(listTasks)
  .use(getTask)
  .use(listMemberTasks)
  .use(suggestAssignee)
  .use(assignAssignee) // PATCH .../task/assignee は、PATCH .../task/:taskId より先に登録する
  .use(updateTask)
  .use(reportComplete)
  .use(confirmComplete)
  .use(listMessages)
  .use(createMessage)
  .use(updateMessage)
  .use(deleteMessage)
  .use(taskDocumentLinks)
  .use(reportDraftEndpoints);
