import { MiddlewareHandler } from "hono";
import * as crypto from "crypto";

const PUBLIC_KEY = process.env.HMAC_PUBLIC_KEY || "";
const SECRET_KEY = process.env.HMAC_SECRET_KEY || "";

export const hmacMiddleware: MiddlewareHandler = async (c, next) => {
  const clientKey = c.req.header("x-key");
  const timestamp = c.req.header("x-timestamp");
  const token = c.req.header("x-token");

  if (!clientKey || !timestamp || !token) {
    return c.json({ error: "Unauthorized." }, 401);
  }

  if (clientKey !== PUBLIC_KEY) {
    return c.json({ error: "Unauthorized." }, 401);
  }

  const now = Math.floor(Date.now() / 1000);
  const parseTimestamp = parseInt(timestamp, 10);
  const maxTimestamp = 60;

  if (isNaN(parseTimestamp)) {
    return c.json({ error: "Unauthorized." }, 400);
  }

  if (Math.abs(now - parseTimestamp) > maxTimestamp) {
    return c.json({ error: "Unauthorized." }, 401);
  }

  // const body = await c.req.raw.clone().text();

  const expectedToken = crypto
    .createHmac("sha256", SECRET_KEY)
    .update(timestamp)
    .digest("hex");

  if (token !== expectedToken) {
    return c.json({ error: "Unauthorized." }, 401);
  }

  await next();
};
