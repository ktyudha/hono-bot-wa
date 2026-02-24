import { Message, MessageTypes } from "whatsapp-web.js";
import { whatsappService } from "./whatsapp.service";
import { generateWaLink } from "@/helpers/generateWaLink";
import { compressImage, compressVideo } from "@/helpers/media";
import { safeBody, safeString } from "@/helpers/general";

export class WhatsAppBotService {
  private client = (whatsappService as any).client;
  private whatsappRedirectGroupId = process.env.WHATSAPP_REDIRECT_GROUP_ID;
  private prefix: string = "!";

  // Map untuk menyimpan relasi pesan group → sender asli
  private replyMap = new Map<string, string>();

  // Map untuk live location tracking
  private liveLocationMap = new Map<
    string,
    { lastUpdate: number; groupMessageId: string }
  >();

  // Dedup: mencegah pesan diproses lebih dari sekali
  private processedMessages = new Set<string>();

  private maxSizeVideo = 16; // MB

  private commands: Map<
    string,
    (message: Message, args: string[]) => Promise<void>
  > = new Map();

  constructor() {
    this.registerCommands();

    // FIX: Hanya SATU listener, routing dilakukan di dalam
    this.client.on("message", (message: Message) =>
      this.handleMessage(message),
    );
  }

  // ─────────────────────────────────────────────────────────────────────────
  // SINGLE ENTRY POINT — semua pesan masuk lewat sini
  // ─────────────────────────────────────────────────────────────────────────
  private async handleMessage(message: Message): Promise<void> {
    console.log(
      `[BOT] Message masuk - from: ${message.from}, type: ${message.type}, body: ${message.body?.slice(0, 50)}`,
    );
    console.log(
      `[BOT] isStatus: ${message.isStatus}, fromMe: ${message.fromMe}`,
    );
    console.log(`[BOT] groupId: ${this.whatsappRedirectGroupId}`);

    // Dedup: skip jika sudah pernah diproses
    const msgId = message.id._serialized;
    if (this.processedMessages.has(msgId)) {
      console.log(`[BOT] Skip duplicate message: ${msgId}`);
      return;
    }
    this.processedMessages.add(msgId);
    setTimeout(() => this.processedMessages.delete(msgId), 60_000);

    try {
      // 1. Reply dari group admin → teruskan ke user asli
      if (message.from === this.whatsappRedirectGroupId) {
        await this.handleGroupReply(message);
        return;
      }

      // 2. Pesan command (diawali prefix "!")
      const body = safeBody(message.body, "");
      if (body.startsWith(this.prefix)) {
        await this.handleCommand(message, body);
        return;
      }

      // 3. Pesan dari user biasa (bukan group) → forward ke group redirect
      if (!message.from.endsWith("@g.us") && !message.isStatus) {
        await this.handleForwardToGroup(message);
        return;
      }
    } catch (err) {
      console.error("[BOT] handleMessage error:", err);
    }
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Handler 1: Command (!ping, !help, dst)
  // ─────────────────────────────────────────────────────────────────────────
  private async handleCommand(message: Message, body: string): Promise<void> {
    const [cmd, ...args] = body.slice(this.prefix.length).split(" ");
    const commandHandler = this.commands.get(cmd.toLowerCase());

    if (commandHandler) {
      try {
        console.log(`[BOT] Executing command: ${cmd}`);
        await commandHandler(message, args);
      } catch (err) {
        console.error(`[BOT] Error on command ${cmd}:`, err);
        await message.reply("Terjadi kesalahan saat menjalankan perintah.");
      }
    } else {
      await message.reply(
        "Perintah tidak dikenal.\nKetik *!help* untuk daftar perintah.",
      );
    }
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Handler 2: Forward pesan user → group redirect
  // ─────────────────────────────────────────────────────────────────────────
  private async handleForwardToGroup(message: Message): Promise<void> {
    if (!this.whatsappRedirectGroupId) {
      console.error("[BOT] Redirect: WhatsApp redirect groupId is not valid!");
      return;
    }

    if (!message.body && !message.hasMedia && !message.location) {
      console.log("[BOT] Skip empty/system message");
      return;
    }

    const senderId = message.from;
    const senderLabel = senderId.endsWith("@lid")
      ? senderId
      : senderId.replace(/\D/g, "");

    const type = message.type as string;

    // Location / Live Location
    if (type === MessageTypes.LOCATION || type === "live_location") {
      await this.handleForwardLocation(message, senderId, senderLabel, type);
      return;
    }

    // Media
    if (message.hasMedia) {
      await this.handleForwardMedia(message, senderId, senderLabel);
      return;
    }

    // Text biasa
    const textMessage =
      `*Pesan Masuk*\n\n` +
      `*Dari*:\n${senderLabel}\n\n` +
      `*Pesan*:\n${safeBody(message.body)}`;

    const sentMessage = await this.client.sendMessage(
      this.whatsappRedirectGroupId,
      safeString(textMessage),
    );

    this.replyMap.set(sentMessage.id._serialized, senderId);
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Handler 3: Reply dari group admin → kirim balik ke user asli
  // ─────────────────────────────────────────────────────────────────────────
  private async handleGroupReply(message: Message): Promise<void> {
    if (!message.hasQuotedMsg) return;

    const quoted = await message.getQuotedMessage();
    const quotedId = quoted.id._serialized;
    const targetSender = this.replyMap.get(quotedId);

    if (!targetSender) {
      console.warn("[BOT] Reply target not found in replyMap");
      return;
    }

    if (message.hasMedia) {
      const media = await message.downloadMedia();
      if (!media?.data || !media?.mimetype) {
        console.warn("[BOT] Failed to download media for reply");
        return;
      }

      const safeCaption = message.body
        ? `*Balasan Admin*\n\n${safeBody(message.body)}`
        : "*Balasan Admin*";

      await this.client.sendMessage(targetSender, media, {
        caption: safeCaption,
      });
      return;
    }

    await this.client.sendMessage(
      targetSender,
      safeBody(`*Balasan Admin*\n\n${message.body}`),
    );
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Sub-handler: Forward location ke group
  // ─────────────────────────────────────────────────────────────────────────
  private async handleForwardLocation(
    message: Message,
    senderId: string,
    senderLabel: string,
    type: string,
  ): Promise<void> {
    const loc = message.location;
    if (!loc) return;

    const isLive = type === "live_location";
    const now = Date.now();
    const mapsUrl = `https://www.google.com/maps?q=${loc.latitude},${loc.longitude}`;

    const text =
      `*${isLive ? "LIVE LOCATION" : "LOCATION"}*\n\n` +
      `*Dari*:\n${senderLabel}\n\n` +
      `Lat: ${loc.latitude}\n` +
      `Lng: ${loc.longitude}\n` +
      ((loc as any).accuracy ? `Accuracy: ${(loc as any).accuracy} m\n` : "") +
      ((loc as any).address ? `Address: ${(loc as any).address}\n` : "") +
      `\n${mapsUrl}`;

    const existing = this.liveLocationMap.get(senderId);

    if (isLive && existing) {
      await this.client.sendMessage(
        this.whatsappRedirectGroupId,
        safeString(`*Update Lokasi*\n\n${text}`),
      );
      existing.lastUpdate = now;
      return;
    }

    const sentMessage = await this.client.sendMessage(
      this.whatsappRedirectGroupId,
      safeString(text),
    );

    this.replyMap.set(sentMessage.id._serialized, senderId);

    if (isLive) {
      this.liveLocationMap.set(senderId, {
        lastUpdate: now,
        groupMessageId: sentMessage.id._serialized,
      });
    }
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Sub-handler: Forward media ke group
  // ─────────────────────────────────────────────────────────────────────────
  private async handleForwardMedia(
    message: Message,
    senderId: string,
    senderLabel: string,
  ): Promise<void> {
    const media = await message.downloadMedia();

    if (!media?.data || !media?.mimetype) {
      console.warn("[BOT] Failed to download media");
      return;
    }

    let sendMedia = media;

    if (message.type === "image") {
      const compressed = await compressImage(media.data);
      sendMedia = {
        mimetype: "image/jpeg",
        data: compressed,
        filename: "image.jpg",
      };
    }

    if (message.type === "video") {
      const sizeMB = Buffer.from(media.data, "base64").length / 1024 / 1024;
      if (sizeMB <= this.maxSizeVideo) {
        const compressed = await compressVideo(media.data);
        sendMedia = {
          mimetype: "video/mp4",
          data: compressed,
          filename: "video.mp4",
        };
      }
    }

    if (!sendMedia?.data || !sendMedia?.mimetype) {
      console.warn("[BOT] Forward skipped: invalid media");
      return;
    }

    const caption =
      `*Pesan Media*\n\n` +
      `*Dari*:\n${senderLabel}\n\n` +
      `*Tipe*:\n${message.type.toUpperCase()}\n\n` +
      (message.body ? `*Caption*:\n${safeBody(message.body)}` : "");

    const sentMessage = await this.client.sendMessage(
      this.whatsappRedirectGroupId,
      sendMedia,
      {
        caption: safeString(caption),
        sendMediaAsDocument: message.type === "video",
      },
    );

    this.replyMap.set(sentMessage.id._serialized, senderId);
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Register Commands
  // ─────────────────────────────────────────────────────────────────────────
  private registerCommands() {
    this.commands.set("ping", async (message) => {
      await message.reply("pong 🏓");
    });

    this.commands.set("get-chat", async (message) => {
      const chats = await whatsappService.getChats();
      const chatList = chats
        .filter((c) => c.id)
        .map((c) => generateWaLink(c.id))
        .slice(0, 10)
        .join("\n");
      await message.reply(`*Get Chat*\n${chatList}`);
    });

    this.commands.set("help", async (message) => {
      const helpText = Array.from(this.commands.keys())
        .map((cmd) => `• !${cmd}`)
        .join("\n");
      await message.reply(`WhatsApp Bot Command\n${helpText}`);
    });

    this.commands.set("location", async (message) => {
      let location = message.location;

      if (!location && message.hasQuotedMsg) {
        const quoted = await message.getQuotedMessage();
        location = quoted.location;
      }

      if (!location) {
        await message.reply(
          "Kirim lokasi atau *reply pesan lokasi* lalu ketik `!location`.",
        );
        return;
      }

      const { latitude, longitude, accuracy, speed, degrees, address } =
        location as any;

      await message.reply(
        `*Location Received*\n\n` +
          `Lat: ${latitude}\n` +
          `Lng: ${longitude}\n` +
          (accuracy ? `Accuracy: ${accuracy} m\n` : "") +
          (speed ? `Speed: ${speed}\n` : "") +
          (degrees ? `Direction: ${degrees}\n` : "") +
          (address ? `\nAddress: ${address}` : ""),
      );
    });
  }
}

export const whatsappBotService = new WhatsAppBotService();
