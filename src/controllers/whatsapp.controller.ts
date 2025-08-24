import { Context } from "hono";
import { whatsappService } from "../services/whatsapp.service";

export class WhatsAppController {
  public async getStatus(c: Context) {
    try {
      const status = whatsappService.getStatus();
      return c.json({
        success: true,
        data: status,
      });
    } catch (error) {
      return c.json(
        {
          success: false,
          error: "Failed to get status",
        },
        500
      );
    }
  }

  public async sendMessage(c: Context) {
    try {
      const { to, message } = await c.req.json();

      if (!to || !message) {
        return c.json(
          {
            success: false,
            error: "Missing required fields: to and message",
          },
          400
        );
      }

      await whatsappService.sendMessage(to, message);

      return c.json({
        success: true,
        message: "Message sent successfully",
      });
    } catch (error: any) {
      return c.json(
        {
          success: false,
          error: error.message || "Failed to send message",
        },
        500
      );
    }
  }

  public async sendMedia(c: Context) {
    try {
      const { to, mediaUrl, caption } = await c.req.json();

      if (!to || !mediaUrl) {
        return c.json(
          {
            success: false,
            error: "Missing required fields: to and mediaUrl",
          },
          400
        );
      }

      await whatsappService.sendMedia(to, mediaUrl, caption);

      return c.json({
        success: true,
        message: "Media sent successfully",
      });
    } catch (error: any) {
      return c.json(
        {
          success: false,
          error: error.message || "Failed to send media",
        },
        500
      );
    }
  }

  public async getChats(c: Context) {
    try {
      const chats = await whatsappService.getChats();

      return c.json({
        success: true,
        data: chats,
      });
    } catch (error: any) {
      return c.json(
        {
          success: false,
          error: error.message || "Failed to get chats",
        },
        500
      );
    }
  }

  public async logout(c: Context) {
    try {
      await whatsappService.logout();

      return c.json({
        success: true,
        message: "Logged out successfully",
      });
    } catch (error: any) {
      return c.json(
        {
          success: false,
          error: error.message || "Failed to logout",
        },
        500
      );
    }
  }
}

export const whatsappController = new WhatsAppController();
