// index.js

import { Hono } from "hono";
import coreRoutes from "@/core/routes.core";
import createApp from "@/core/app.core";
import whatsappInitialize from "@/core/whatsapp.core";
import "dotenv/config";

const app = new Hono();

await whatsappInitialize();
// Running
coreRoutes(app);
createApp(app);
