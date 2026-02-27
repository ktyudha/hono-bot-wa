import { Hono } from "hono";
import whatsappRouter from "@/routes/whatsapp.routes";
import publicRouter from "@/routes/public.routes";

const routes: { path: string; router: Hono }[] = [
  { path: "/whatsapp", router: whatsappRouter },
  { path: "/public", router: publicRouter },
];

export default function coreRoutes(app: Hono) {
  const api = app;

  routes.forEach(({ path, router }) => api.route(path, router));

  app.route("/api", api);
}
