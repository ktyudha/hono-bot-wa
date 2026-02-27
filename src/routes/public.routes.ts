import { Hono } from "hono";
import { publicController } from "../controllers/public.controller";

const publicRouter = new Hono();

// Send Message Group / Chat
publicRouter.post("/send-message-global", (c) =>
    publicController.sendMessageGlobal(c)
);

export default publicRouter;