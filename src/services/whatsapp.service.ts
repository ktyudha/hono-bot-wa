import {
  Client,
  LocalAuth,
  Message,
  MessageMedia,
  GroupChat,
} from "whatsapp-web.js";
import fs from "fs";
import * as qrcode from "qrcode-terminal";
import { formatPhoneNumber } from "@/helpers/formatPhoneNumber";
import { logger } from "@/helpers/logger";

export class WhatsAppService {
  private client: Client;
  private isReady: boolean = false;
  private isInitializing: boolean = false;
  public botNumber: string | null = null;

  // FIX: Simpan callback dari luar (WhatsAppBotService)
  // Tidak perlu akses client langsung dari luar class ini
  private messageHandlers: ((message: Message) => Promise<void>)[] = [];

  // Dedup di satu tempat — bukan tersebar di tiap service
  private processedMessages: Set<string> = new Set();

  constructor() {
    this.client = this.createClient();
    this.initializeEvents();
  }

  private createClient(): Client {
    return new Client({
      authStrategy: new LocalAuth(),
      puppeteer: {
        headless: true,
        args: [
          "--no-sandbox",
          "--disable-setuid-sandbox",
          "--disable-dev-shm-usage",
          "--disable-accelerated-2d-canvas",
          "--no-first-run",
          "--no-zygote",
          "--disable-gpu",
          "--disable-extensions",
          "--single-process",
        ],
      },
    });
  }

  private initializeEvents(): void {
    this.client.on("qr", (qr: string) => {
      logger.bot("QR Code received, scan dengan WhatsApp Anda:");
      qrcode.generate(qr, { small: true });
    });

    this.client.on("ready", () => {
      this.isReady = true;
      this.isInitializing = false;
      this.botNumber = this.client.info.wid.user;
      logger.bot(`client ready, nomor: ${this.botNumber}`);
    });

    this.client.on("authenticated", () => {
      logger.bot("authenticated successfully");
    });

    this.client.on("auth_failure", (msg: string) => {
      logger.error(`authentication failed: ${msg}`);
      this.isReady = false;
      this.isInitializing = false;
    });

    this.client.on("disconnected", async (reason: string) => {
      if (this.isInitializing) return;
      this.isReady = false;
      this.isInitializing = true;
      logger.warn(`client disconnected: ${reason}`);

      try {
        await this.client.destroy();
      } catch (_) { }

      // Buat client baru — messageHandlers tetap tersimpan
      // WhatsAppBotService tidak perlu register ulang
      this.client = this.createClient();
      this.initializeEvents();

      try {
        await this.client.initialize();
      } catch (err) {
        logger.error("gagal reinitialize:", err);
        this.isInitializing = false;
      }
    });

    // SATU listener message — dedup di sini
    this.client.on("message", async (message: Message) => {
      const msgId = message.id._serialized;

      if (this.processedMessages.has(msgId)) {
        logger.bot(`skip duplicate: ${msgId}`);
        return;
      }
      this.processedMessages.add(msgId);
      setTimeout(() => this.processedMessages.delete(msgId), 60_000);

      // Dispatch ke semua handler yang terdaftar
      for (const handler of this.messageHandlers) {
        try {
          await handler(message);
        } catch (err) {
          logger.error("message handler error:", err);
        }
      }
    });
  }

  // ─── Public API ───────────────────────────────────────────────────────────

  /**
   * Register message handler dari luar (WhatsAppBotService).
   * Dipanggil sekali saja — tidak perlu akses client langsung.
   */
  public onMessage(handler: (message: Message) => Promise<void>): void {
    logger.bot(`onMessage registered, total handlers: ${this.messageHandlers.length}`);
    this.messageHandlers.push(handler);
  }

  /**
   * Kirim pesan — dipakai oleh BotService supaya tidak akses client langsung
   */
  public async sendMessage(
    to: string,
    content: any,
    options?: any,
  ): Promise<any> {
    if (!this.isReady) throw new Error("WhatsApp client: not ready");
    return this.client.sendMessage(to, content, options);
  }

  public async sendChatMessage(to: string, message: string): Promise<void> {
    if (!this.isReady) {
      throw new Error("WhatsApp client: not ready");
    }

    try {
      const chatId = await this.toWhatsAppId(to);
      await this.client.sendMessage(chatId, message);
      logger.send(`message sent to: ${chatId}`);
    } catch (error) {
      logger.error("sendChatMessage error:", error);
      throw error;
    }
  }

  public async initialize(): Promise<void> {
    if (this.isInitializing || this.isReady) return;
    this.isInitializing = true;
    try {
      await this.client.initialize();
    } catch (error) {
      this.isInitializing = false;
      throw error;
    }
  }

  public async sendMessageGlobal(to: string, message: string): Promise<void> {
    if (!this.isReady) throw new Error("WhatsApp client: not ready");
    this.validateWhatsAppId(to);

    try {
      await this.client.sendMessage(to, message);
      logger.send(`message sent to: ${to}`);
    } catch (error) {
      logger.error("sendMessageGlobal error:", error);
      throw error;
    }
  }

  public async sendMediaGlobal(
    to: string,
    filePath: string,
    caption?: string,
  ): Promise<void> {
    if (!this.isReady) throw new Error("WhatsApp client: not ready");
    this.validateWhatsAppId(to);

    try {
      const chatId = await this.toWhatsAppId(to);
      const media = MessageMedia.fromFilePath(filePath);

      await this.client.sendMessage(chatId, media, {
        caption,
      });

      // remove temporary file
      fs.unlink(filePath, (err) => {
        if (err) logger.error("failed delete tmp file:", err);
      });

      logger.send(`media sent to: ${chatId}`);
    } catch (error) {
      logger.error("sendMediaGlobal error:", error);
      throw error;
    }
  }

  public async sendMedia(
    to: string,
    mediaUrl: string,
    caption?: string,
  ): Promise<void> {
    if (!this.isReady) throw new Error("WhatsApp client is not ready");
    const chatId = await this.toWhatsAppId(to);
    const media = await MessageMedia.fromUrl(mediaUrl);
    await this.client.sendMessage(chatId, media, { caption });
  }

  public async sendMediaWithUrl(
    to: string,
    mediaUrl: string,
    caption?: string,
  ): Promise<void> {
    if (!this.isReady) throw new Error("WhatsApp client is not ready");

    try {
      const chatId = await this.toWhatsAppId(to);
      const media = await MessageMedia.fromUrl(mediaUrl);

      await this.client.sendMessage(chatId, media, { caption });
      logger.send(`media sent to: ${chatId}`);
    } catch (error) {
      logger.error("sendMediaWithUrl error:", error);
      throw error;
    }
  }

  public async sendMediaToGroup(
    groupId: string,
    mediaUrl: string,
    caption?: string,
  ): Promise<void> {
    if (!this.isReady) throw new Error("WhatsApp client is not ready");

    try {
      const chatId = await this.toWhatsAppId(groupId, true);
      const media = await MessageMedia.fromUrl(mediaUrl);
      await this.client.sendMessage(chatId, media, { caption });
      logger.send(`media sent to group: ${groupId}`);
    } catch (error) {
      logger.error("sendMediaToGroup error:", error);
      throw error;
    }
  }

  public async sendMessageToGroup(
    groupId: string,
    message: string,
  ): Promise<void> {
    if (!this.isReady) throw new Error("WhatsApp client is not ready");
    const chatId = await this.toWhatsAppId(groupId, true);
    await this.client.sendMessage(chatId, message);
  }

  public async getChats(): Promise<any[]> {
    if (!this.isReady) throw new Error("WhatsApp client is not ready");
    const chats = await this.client.getChats();
    return chats.map((chat) => ({
      id: chat.id._serialized,
      name: chat.name,
      isGroup: chat.isGroup,
      timestamp: chat.timestamp,
    }));
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

  public getStatus(): { isReady: boolean; isAuthenticated: boolean } {
    return {
      isReady: this.isReady,
      isAuthenticated: this.client.info !== undefined,
    };
  }

  public async logout(): Promise<void> {
    await this.client.logout();
    this.isReady = false;
    logger.bot("logged out");
  }

  public async destroy(): Promise<void> {
    await this.client.destroy();
    this.isReady = false;
    logger.bot("destroyed");
  }

  private async toWhatsAppId(target: string, isGroup = false): Promise<string> {
    const extGroup = "@g.us";
    const extChat = "@c.us";

    if (target.endsWith(extChat) || target.endsWith(extGroup)) return target;
    if (!isGroup) return formatPhoneNumber(target) + extChat;
    if (isGroup) return target + extGroup;

    return `${target}`;
  }

  private validateWhatsAppId(target: string) {
    if (!/@(c|g)\.us$/.test(target)) {
      throw new Error("Invalid WhatsApp ID: must end with @c.us or @g.us");
    }
  }
}

export const whatsappService = new WhatsAppService();
