import { Hono } from "hono";
import { serve } from "@hono/node-server";
import { log } from "@/helpers/logger";

export default function createApp(app: Hono) {
  const port = process.env.PORT ? Number(process.env.PORT) : 3000;

  log.cmd(`Server: running!`);

  serve({
    fetch: app.fetch,
    port,
  });
}
