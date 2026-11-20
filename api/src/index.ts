import { app } from "./app";
import { startSoftDeleteCleanup } from "./lib/soft-delete-cleanup";

app.listen(Number(process.env.PORT ?? 3001));
startSoftDeleteCleanup();

console.log(
  `🦊 Elysia is running at ${app.server?.hostname}:${app.server?.port}`,
);
