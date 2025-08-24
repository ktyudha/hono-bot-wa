import { serve } from "@hono/node-server";
export default function createApp(app) {
    const port = process.env.PORT ? Number(process.env.PORT) : 3000;
    console.log(`Server: running!`);
    serve({
        fetch: app.fetch,
        port,
    });
}
