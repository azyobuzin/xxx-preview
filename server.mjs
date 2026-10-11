// @ts-check

import { serve } from "@hono/node-server";
import { createApp } from "./lib/app.mjs";

const secretKey = process.env.SECRET_KEY_BASE;
if (!secretKey) throw new Error("SECRET_KEY_BASE is required");

const app = createApp({ fetch, secretKey });

serve({
  fetch: app.fetch,
  port: Number(process.env.PORT ?? 8080),
});
