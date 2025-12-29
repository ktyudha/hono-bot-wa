import { Hono } from "hono";
import { hmacMiddleware } from "@/middlewares/hmac.middleware";
import { whatsappController } from "../controllers/whatsapp.controller";

const whatsappRouter = new Hono();

// Hmac Middleware
whatsappRouter.use("*", hmacMiddleware);

// Send Message Group / Chat
whatsappRouter.post("/send-message-global", (c) =>
  whatsappController.sendMessageGlobal(c)
);

// Get WhatsApp status
whatsappRouter.get("/status", (c) => whatsappController.getStatus(c));

// Send message
whatsappRouter.post("/send-message", (c) => whatsappController.sendMessage(c));

// Send media
whatsappRouter.post("/send-media-url", (c) =>
  whatsappController.sendMediaWithUrl(c)
);

// Send message to group
whatsappRouter.post("/send-message-group", (c) =>
  whatsappController.sendMessageToGroup(c)
);

// Send media to group
whatsappRouter.post("/send-media-group", (c) =>
  whatsappController.sendMediaToGroup(c)
);

// Get chats
whatsappRouter.get("/chats", (c) => whatsappController.getChats(c));

// Get messages from a personal chat
whatsappRouter.get("/chat-messages", (c) =>
  whatsappController.getChatMessages(c)
);

// Get groups only
whatsappRouter.get("/groups", (c) => whatsappController.getGroups(c));

// Get messages from a group
whatsappRouter.get("/group-messages", (c) =>
  whatsappController.getGroupMessages(c)
);

// Logout
whatsappRouter.post("/logout", (c) => whatsappController.logout(c));

// Destroy client
whatsappRouter.post("/destroy", (c) => whatsappController.destroy(c));

export default whatsappRouter;
