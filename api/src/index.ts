import { cors } from "@elysiajs/cors";
import { openapi } from "@elysiajs/openapi";
import { Elysia } from "elysia";
import { auth, webOrigin } from "./auth";
import { productRoutes } from "./routes/product";

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
  .use(productRoutes)
  .mount(auth.handler)
  .get("/", () => "Hello Elysia")
  .listen(Number(process.env.PORT ?? 3001));

console.log(
  `🦊 Elysia is running at ${app.server?.hostname}:${app.server?.port}`
);
