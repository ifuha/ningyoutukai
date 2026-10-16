import { cors } from "@elysiajs/cors";
import { Elysia } from "elysia";
import { auth, webOrigin } from "./auth";

const app = new Elysia()
  .use(cors({ origin: webOrigin, credentials: true }))
  .mount(auth.handler)
  .get("/", () => "Hello Elysia")
  .listen(Number(process.env.PORT ?? 3001));

console.log(
  `🦊 Elysia is running at ${app.server?.hostname}:${app.server?.port}`
);
