import { Message, MessageTypes, MessageMedia } from "whatsapp-web.js";
import { whatsappService } from "./whatsapp.service";
import { generateWaLink } from "@/helpers/generateWaLink";
import { compressImage, compressVideo } from "@/helpers/media";
import { safeBody, safeString } from "@/helpers/general";

export class WhatsAppBotService {
  private whatsappRedirectGroupId = process.env.WHATSAPP_REDIRECT_GROUP_ID;
  private prefix: string = "!";
  private replyMap = new Map<string, string>();
  private liveLocationMap = new Map<
    string,
    { lastUpdate: number; groupMessageId: string }
  >();
  private maxSizeVideo = 16; // MB

  private commands: Map<
    string,
    (message: Message, args: string[]) => Promise<void>
  > = new Map();

  constructor() {
    this.registerCommands();

    // FIX: Pakai onMessage() bukan akses client langsung
    // Listener sudah ada di WhatsAppService — tidak akan numpuk saat reconnect
    whatsappService.onMessage((message) => this.handleMessage(message));
  }

  // ─────────────────────────────────────────────────────────────────────────
  // SINGLE ENTRY POINT
  // ─────────────────────────────────────────────────────────────────────────
  private async handleMessage(message: Message): Promise<void> {
    console.log(
      `[BOT] from: ${message.from} | type: ${message.type} | body: ${message.body?.slice(0, 50)}`,
    );

    try {
      // 1. Reply dari group admin → teruskan ke user asli
      if (message.from === this.whatsappRedirectGroupId) {
        await this.handleGroupReply(message);
        return;
      }

      // 2. Command (diawali prefix "!")
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
  // Handler 1: Command
  // ─────────────────────────────────────────────────────────────────────────
  private async handleCommand(message: Message, body: string): Promise<void> {
    const [cmd, ...args] = body.slice(this.prefix.length).split(" ");
    const commandHandler = this.commands.get(cmd.toLowerCase());

    if (commandHandler) {
      try {
        console.log(`[BOT] Command: ${cmd}`);
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
      console.error("[BOT] WHATSAPP_REDIRECT_GROUP_ID tidak ada di .env!");
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

    if (type === MessageTypes.LOCATION || type === "live_location") {
      await this.handleForwardLocation(message, senderId, senderLabel, type);
      return;
    }

    if (message.hasMedia) {
      await this.handleForwardMedia(message, senderId, senderLabel);
      return;
    }

    const textMessage =
      `*Pesan Masuk*\n\n` +
      `*Dari*:\n${senderLabel}\n\n` +
      `*Pesan*:\n${safeBody(message.body)}`;

    const sentMessage = await whatsappService.sendMessage(
      this.whatsappRedirectGroupId,
      safeString(textMessage),
    );

    this.replyMap.set(sentMessage.id._serialized, senderId);
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Handler 3: Reply dari group → kirim balik ke user
  // ─────────────────────────────────────────────────────────────────────────
  private async handleGroupReply(message: Message): Promise<void> {
    if (!message.hasQuotedMsg) return;

    const quoted = await message.getQuotedMessage();
    const targetSender = this.replyMap.get(quoted.id._serialized);

    if (!targetSender) {
      console.warn("[BOT] Reply target tidak ditemukan di replyMap");
      return;
    }

    if (message.hasMedia) {
      const media = await message.downloadMedia();
      if (!media?.data || !media?.mimetype) return;

      const caption = message.body
        ? `*Balasan Admin* \n\n${safeBody(message.body)}`
        : "*Balasan Admin* ";

      await whatsappService.sendMessage(targetSender, media, { caption });
      return;
    }

    await whatsappService.sendMessage(
      targetSender,
      safeBody(`*Balasan Admin* \n\n${message.body}`),
    );
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Sub-handler: Forward location
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
      `Lat: ${loc.latitude}\nLng: ${loc.longitude}\n` +
      ((loc as any).accuracy ? `Accuracy: ${(loc as any).accuracy} m\n` : "") +
      ((loc as any).address ? `Address: ${(loc as any).address}\n` : "") +
      `\n${mapsUrl}`;

    const existing = this.liveLocationMap.get(senderId);
    if (isLive && existing) {
      await whatsappService.sendMessage(
        this.whatsappRedirectGroupId!,
        safeString(`*Update Lokasi*\n\n${text}`),
      );
      existing.lastUpdate = now;
      return;
    }

    const sentMessage = await whatsappService.sendMessage(
      this.whatsappRedirectGroupId!,
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
  // Sub-handler: Forward media
  // ─────────────────────────────────────────────────────────────────────────
  private async handleForwardMedia(
    message: Message,
    senderId: string,
    senderLabel: string,
  ): Promise<void> {
    console.log("[BOT] handleForwardMedia start, type:", message.type);

    const media = await message.downloadMedia();
    console.log(
      "[BOT] downloadMedia done, has data:",
      !!media?.data,
      "mimetype:",
      media?.mimetype,
    );

    if (!media?.data || !media?.mimetype) return;

    let sendMedia = media;

    if (message.type === "image") {
      console.log("[BOT] compressing image...");
      const compressed = await compressImage(media.data);

      console.log("[BOT] compress image done, length:", compressed.length);
      sendMedia = new MessageMedia("image/jpeg", compressed, "image.jpg");
    }

    if (message.type === "video") {
      console.log("[BOT] compressing video...");
      const sizeMB = Buffer.from(media.data, "base64").length / 1024 / 1024;

      if (sizeMB <= this.maxSizeVideo) {
        const compressed = await compressVideo(media.data);
        console.log("[BOT] compress video done, length:", compressed.length);

        sendMedia = new MessageMedia("video/mp4", compressed, "video.mp4");
      }
    }

    if (!sendMedia?.data || !sendMedia?.mimetype) return;

    const bodyText =
      typeof message.body === "string" && message.body.length < 300
        ? message.body
        : "";

    const caption =
      `*Pesan Media*\n\n` +
      `*Dari*:\n${senderLabel}\n\n` +
      `*Tipe*:\n${message.type.toUpperCase()}\n\n` +
      (bodyText ? `*Caption*:\n${safeBody(bodyText)}` : "");

    console.log("[BOT] sending media to group...");
    const sentMessage = await whatsappService.sendMessage(
      this.whatsappRedirectGroupId!,
      sendMedia,
      {
        caption: safeString(caption),
        sendMediaAsDocument: message.type === "video",
      },
    );

    // const { MessageMedia } = await import("whatsapp-web.js");
    // const mediaToSend = new MessageMedia(
    //   sendMedia.mimetype,
    //   sendMedia.data,
    //   sendMedia.filename ?? null,
    // );

    // const sentMessage = await this.client.sendMessage(
    //   this.whatsappRedirectGroupId!,
    //   mediaToSend,
    //   { caption: safeString(caption) },
    // );

    console.log("[BOT] sent! id:", sentMessage.id._serialized);

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
          `Lat: ${latitude}\nLng: ${longitude}\n` +
          (accuracy ? `Accuracy: ${accuracy} m\n` : "") +
          (speed ? `Speed: ${speed}\n` : "") +
          (degrees ? `Direction: ${degrees}\n` : "") +
          (address ? `\nAddress: ${address}` : ""),
      );
    });
  }
}
