import {
  Client,
  LocalAuth,
  Message,
  MessageMedia,
  GroupChat,
} from "whatsapp-web.js";
import * as qrcode from "qrcode-terminal";
import { formatPhoneNumber } from "@/helpers/formatPhoneNumber";

export class WhatsAppService {
  private client: Client;
  private isReady: boolean = false;

  constructor() {
    this.client = new Client({
      authStrategy: new LocalAuth(),
      puppeteer: {
        headless: true,
        args: ["--no-sandbox", "--disable-setuid-sandbox"],
      },
    });

    this.initializeEvents();
  }

  private initializeEvents(): void {
    this.client.on("qr", (qr: string) => {
      console.log("QR Code received, scan dengan WhatsApp Anda:");
      qrcode.generate(qr, { small: true });
    });

    this.client.on("ready", () => {
      console.log("WhatsApp client is ready!");
      this.isReady = true;
    });

    this.client.on("authenticated", () => {
      console.log("Authenticated successfully");
    });

    this.client.on("auth_failure", (msg: string) => {
      console.error("Authentication failed:", msg);
    });

    this.client.on("disconnected", (reason: string) => {
      console.log("Client was logged out", reason);
      this.isReady = false;
    });

    // Handle incoming messages
    this.client.on("message", this.handleIncomingMessage.bind(this));
  }

  private async handleIncomingMessage(message: Message): Promise<void> {
    try {
      console.log(`Received message from ${message.from}: ${message.body}`);

      // Contoh handler sederhana
      if (message.body.toLowerCase() === "ping") {
        await message.reply("pong");
      }

      if (message.body.toLowerCase() === "info") {
        const chat = await message.getChat();
        await message.reply(`Chat ID: ${chat.id._serialized}`);
      }
    } catch (error) {
      console.error("Error handling message:", error);
    }
  }

  public async initialize(): Promise<void> {
    try {
      await this.client.initialize();
      console.log("WhatsApp client: initialized");
    } catch (error) {
      console.error("Failed to initialize WhatsApp client:", error);
      throw error;
    }
  }

  public async sendMessage(to: string, message: string): Promise<void> {
    if (!this.isReady) {
      throw new Error("WhatsApp client: not ready");
    }

    try {
      const chatId = await this.toWhatsAppId(to);
      await this.client.sendMessage(chatId, message);
      console.log(`Message sent to: ${chatId}`);
    } catch (error) {
      console.error("Message sent error:", error);
      throw error;
    }
  }

  public async sendMedia(
    to: string,
    mediaUrl: string,
    caption?: string
  ): Promise<void> {
    if (!this.isReady) throw new Error("WhatsApp client is not ready");

    try {
      const chatId = await this.toWhatsAppId(to);
      const media = await MessageMedia.fromUrl(mediaUrl);

      await this.client.sendMessage(chatId, media, { caption });
      console.log(`Media sent to: ${chatId}`);
    } catch (error) {
      console.error("Error sending media:", error);
      throw error;
    }
  }

  public async sendMessageToGroup(
    groupId: string,
    message: string
  ): Promise<void> {
    if (!this.isReady) throw new Error("WhatsApp client is not ready");

    try {
      const chatId = await this.toWhatsAppId(groupId, true);
      await this.client.sendMessage(chatId, message);
      console.log(`Message sent to group: ${groupId}`);
    } catch (error) {
      console.error("Error sending message to group:", error);
      throw error;
    }
  }

  public async sendMediaToGroup(
    groupId: string,
    mediaUrl: string,
    caption?: string
  ): Promise<void> {
    if (!this.isReady) throw new Error("WhatsApp client is not ready");

    try {
      const chatId = await this.toWhatsAppId(groupId, true);
      const media = await MessageMedia.fromUrl(mediaUrl);
      await this.client.sendMessage(chatId, media, { caption });
      console.log(`Media sent to group: ${groupId}`);
    } catch (error) {
      console.error("Error sending media to group:", error);
      throw error;
    }
  }

  public async getChats(): Promise<any[]> {
    if (!this.isReady) throw new Error("WhatsApp client is not ready");

    try {
      const chats = await this.client.getChats();
      return chats.map((chat) => ({
        id: chat.id._serialized,
        name: chat.name,
        isGroup: chat.isGroup,
        timestamp: chat.timestamp,
      }));
    } catch (error) {
      console.error("Error getting chats:", error);
      throw error;
    }
  }

  public async getGroups(): Promise<any[]> {
    if (!this.isReady) throw new Error("WhatsApp client is not ready");

    const chats = await this.client.getChats();

    return chats
      .filter((chat) => chat.isGroup)
      .map((chat) => {
        const groupChat = chat as GroupChat;

        return {
          id: groupChat.id._serialized,
          name: groupChat.name,
          participants: groupChat.participants.length,
        };
      });
  }

  public async getGroupMessages(groupId: string, limit: number = 10) {
    if (!this.isReady) throw new Error("WhatsApp client is not ready");

    const chatId = await this.toWhatsAppId(groupId, true);
    const chat = await this.client.getChatById(chatId);
    const messages = await chat.fetchMessages({ limit });

    return messages.map((msg) => ({
      id: msg.id._serialized,
      from: msg.from,
      body: msg.body,
      timestamp: msg.timestamp,
      isFromMe: msg.fromMe,
      type: msg.type,
    }));
  }

  public async getChatMessages(to: string, limit: number = 10) {
    if (!this.isReady) throw new Error("WhatsApp client is not ready");

    const chatId = await this.toWhatsAppId(to);
    const chat = await this.client.getChatById(chatId);
    const messages = await chat.fetchMessages({ limit });

    return messages.map((msg) => ({
      id: msg.id._serialized,
      from: msg.from,
      body: msg.body,
      timestamp: msg.timestamp,
      isFromMe: msg.fromMe,
      type: msg.type,
    }));
  }

  public getStatus(): { isReady: boolean; isAuthenticated: boolean } {
    return {
      isReady: this.isReady,
      isAuthenticated: this.client.info !== undefined,
    };
  }

  public async logout(): Promise<void> {
    try {
      await this.client.logout();
      this.isReady = false;
      console.log("Logged out successfully");
    } catch (error) {
      console.error("Error logging out:", error);
      throw error;
    }
  }

  public async destroy(): Promise<void> {
    try {
      await this.client.destroy();
      this.isReady = false;
      console.log("Client destroyed");
    } catch (error) {
      console.error("Error destroying client:", error);
      throw error;
    }
  }

  private async toWhatsAppId(target: string, isGroup = false): Promise<string> {
    const extGroup = "@g.us";
    const extChat = "@c.us";

    if (target.endsWith(extChat) || target.endsWith(extGroup)) return target;
    if (!isGroup) return formatPhoneNumber(target) + extChat;
    if (isGroup) return target + extGroup;

    return `${target}`;
  }
}

export const whatsappService = new WhatsAppService();
