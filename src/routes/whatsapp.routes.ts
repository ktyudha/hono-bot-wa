import { Hono } from "hono";
import { hmacMiddleware } from "@/middlewares/hmac.middleware";
import { whatsappController } from "../controllers/whatsapp.controller";

const whatsappRouter = new Hono();

// Hmac Middleware
whatsappRouter.use("*", hmacMiddleware);

// Get WhatsApp status
whatsappRouter.get("/status", (c) => whatsappController.getStatus(c));

// Send message
whatsappRouter.post("/send-message", (c) => whatsappController.sendMessage(c));

// Send media
whatsappRouter.post("/send-media", (c) => whatsappController.sendMedia(c));

// Get chats
whatsappRouter.get("/chats", (c) => whatsappController.getChats(c));

// Logout
whatsappRouter.post("/logout", (c) => whatsappController.logout(c));

export default whatsappRouter;
