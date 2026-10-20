import { cors } from "@elysiajs/cors";
import { openapi } from "@elysiajs/openapi";
import { Elysia } from "elysia";
import { auth, webOrigin } from "./auth";
import { errorHandler } from "./lib/error-handler";
import { productRoutes } from "./routes/product";
import { productTreeRoutes } from "./routes/product-tree";
import { taskRoutes } from "./routes/task";
import { deleteTaskRoutes } from "./routes/task/delete-task";

const app = new Elysia()
  .use(cors({ origin: webOrigin, credentials: true }))
  .use(
    openapi({
      provider: "swagger-ui",
      path: "/swagger",
      documentation: {
        info: { title: "人形使い API", version: "0.1.0" },
      },
    })
  )
  .use(errorHandler)
  .use(productRoutes)
  .use(productTreeRoutes)
  .use(taskRoutes)
  .use(deleteTaskRoutes)
  .all("/api/auth/*", ({ request }) => auth.handler(request), { parse: "none", detail: { hide: true } })
  .get("/", () => "Hello Elysia")
  .listen(Number(process.env.PORT ?? 3001));

console.log(
  `🦊 Elysia is running at ${app.server?.hostname}:${app.server?.port}`
);
