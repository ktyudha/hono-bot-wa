import { Message, MessageTypes, MessageMedia } from "whatsapp-web.js";
import { whatsappService } from "./whatsapp.service";
import { generateWaLink } from "@/helpers/generateWaLink";
import { compressImage, compressVideo } from "@/helpers/media";
import { safeBody, safeString } from "@/helpers/general";
import { logger } from "@/helpers/logger";

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
    logger.bot(`from: ${message.from} | type: ${message.type} | body: ${message.body?.slice(0, 50)}`);

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
      logger.error("handleMessage error:", err);
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
        logger.cmd(`Command: ${cmd}`);
        await commandHandler(message, args);
      } catch (err) {
        logger.error(`Error on command ${cmd}:`, err);
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
      logger.error("WHATSAPP_REDIRECT_GROUP_ID tidak ada di .env!");
      return;
    }

    if (!message.body && !message.hasMedia && !message.location) {
      logger.bot("Skip empty/system message");
      return;
    }

    const senderId = message.from;

    const contact = await message.getContact();
    const senderName = contact.pushname || contact.name || contact.number || senderId;
    const senderNumber = contact.number || contact.id.user || senderId;

    const type = message.type as string;

    if (type === MessageTypes.LOCATION || type === "live_location") {
      await this.handleForwardLocation(message, senderId, senderName, senderNumber, type);
      return;
    }

    if (message.hasMedia) {
      await this.handleForwardMedia(message, senderId, senderName, senderNumber);
      return;
    }

    const textMessage =
      `*Pesan Masuk*\n\n` +
      `*Dari*: ${senderName}\n` +
      `*Nomor*: +${senderNumber}\n\n` +
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
      logger.warn("Reply target tidak ditemukan di replyMap");
      return;
    }

    if (message.hasMedia) {
      const media = await message.downloadMedia();
      if (!media?.data || !media?.mimetype) return;

      await whatsappService.sendMessage(targetSender, media, {
        caption: message.body ? safeBody(message.body) : undefined,
      });
      return;
    }

    await whatsappService.sendMessage(
      targetSender,
      safeBody(message.body),
    );
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Sub-handler: Forward location
  // ─────────────────────────────────────────────────────────────────────────
  private async handleForwardLocation(
    message: Message,
    senderId: string,
    senderName: string,
    senderNumber: string,
    type: string,
  ): Promise<void> {
    const loc = message.location;
    if (!loc) return;

    const isLive = type === "live_location";
    const now = Date.now();
    const mapsUrl = `https://www.google.com/maps?q=${loc.latitude},${loc.longitude}`;

    const text =
      `*${isLive ? "LIVE LOCATION" : "LOCATION"}*\n\n` +
      `*Dari*: ${senderName}\n` +
      `*Nomor*: +${senderNumber}\n\n` +
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
    senderName: string,
    senderNumber: string,
  ): Promise<void> {
    logger.media(`start, type: ${message.type}`);

    const media = await message.downloadMedia();
    logger.media(`downloadMedia done, has data: ${!!media?.data}, mimetype: ${media?.mimetype}`);


    if (!media?.data || !media?.mimetype) return;

    let sendMedia = media;

    if (message.type === "sticker") {
      logger.media("forwarding sticker...");
      await this.sendHeaderMessage(senderName, senderNumber, "sticker");
      const sentMessage = await whatsappService.sendMessage(
        this.whatsappRedirectGroupId!,
        media,
        { sendMediaAsSticker: true }
      );
      logger.send(`sent! id: ${sentMessage.id._serialized}`);
      this.replyMap.set(sentMessage.id._serialized, senderId);
      return;
    }

    if (message.type === "audio" || message.type === "ptt") {
      logger.media("forwarding audio...");
      await this.sendHeaderMessage(senderName, senderNumber, message.type);
      const sentMessage = await whatsappService.sendMessage(
        this.whatsappRedirectGroupId!,
        media,
        { sendAudioAsVoice: message.type === "ptt" }
      );
      logger.send(`sent! id: ${sentMessage.id._serialized}`);
      this.replyMap.set(sentMessage.id._serialized, senderId);
      return;
    }

    if (message.type === "document") {
      logger.media("forwarding document...");
      const sentMessage = await whatsappService.sendMessage(
        this.whatsappRedirectGroupId!,
        media,
        {
          sendMediaAsDocument: true,
          caption: this.buildSenderHeader(senderName, senderNumber, "document"),
        }
      );
      logger.send(`sent! id: ${sentMessage.id._serialized}`);
      this.replyMap.set(sentMessage.id._serialized, senderId);
      return;
    }

    if (message.type === "image") {
      logger.media("compressing image...");
      const compressed = await compressImage(media.data);

      logger.media(`compress image done, length: ${compressed.length}`);
      sendMedia = new MessageMedia("image/jpeg", compressed, "image.jpg");
    }

    if (message.type === "video") {
      logger.media("compressing video...");
      const sizeMB = Buffer.from(media.data, "base64").length / 1024 / 1024;

      if (sizeMB <= this.maxSizeVideo) {
        const compressed = await compressVideo(media.data);

        logger.media(`compress video done, length: ${compressed.length}`);
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
      `*Dari*: ${senderName}\n` +
      `*Nomor*: +${senderNumber}\n\n` +
      `*Tipe*: ${message.type.toUpperCase()}\n\n` +
      (bodyText ? `*Caption*:\n${safeBody(bodyText)}` : "");

    logger.send("sending media to group...");
    const sentMessage = await whatsappService.sendMessage(
      this.whatsappRedirectGroupId!,
      sendMedia,
      {
        caption: safeString(caption),
        sendMediaAsDocument: message.type === "video",
      },
    );

    logger.send(`sent! id: ${sentMessage.id._serialized}`);
    this.replyMap.set(sentMessage.id._serialized, senderId);
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Register Commands
  // ─────────────────────────────────────────────────────────────────────────
  private registerCommands() {
    this.commands.set("ping", async (message) => {
      await message.reply("pong 🏓");
    });

    this.commands.set("help", async (message) => {
      const helpText = Array.from(this.commands.keys())
        .map((cmd) => `• !${cmd}`)
        .join("\n");
      await message.reply(`WhatsApp Bot Command\n${helpText}`);
    });

    this.commands.set("get-chat", async (message) => {
      const chats = await whatsappService.getChats();
      logger.bot(`get-chat: total chats ${chats.length}`);

      const filtered = chats
        .filter((c) => c.id?._serialized)
        .slice(0, 10);

      logger.bot(`get-chat: filtered ${filtered.length} chats`);

      const chatLines = await Promise.all(
        filtered.map(async (c, i) => {
          const isGroup = c.id._serialized.endsWith("@g.us");

          if (isGroup) {
            const groupChat = c as any;
            logger.bot(`get-chat: group ${c.name} | ${c.id._serialized}`);
            return [
              `*${i + 1}. [Group] ${c.name}*`,
              `id      : ${c.id._serialized}`,
              `members : ${groupChat.participants?.length || "-"}`,
            ].join("\n");
          }

          try {
            const contact = await Promise.race([
              c.getContact(),
              new Promise((_, reject) =>
                setTimeout(() => reject(new Error("timeout")), 3000)
              ),
            ]) as any;

            const name = contact.pushname || contact.name || contact.number || c.id.user;
            const number = contact.number || contact.id.user;

            logger.bot(`get-chat: personal ${name} | ${number}`);
            return [
              `*${i + 1}. ${name}*`,
              `number  : +${number}`,
              `id      : ${c.id._serialized}`,
            ].join("\n");
          } catch (err) {
            logger.warn(`get-chat: gagal getContact ${c.id._serialized}: ${err}`);
            return [
              `*${i + 1}. ${c.id.user}*`,
              `number  : +${c.id.user}`,
              `id      : ${c.id._serialized}`,
            ].join("\n");
          }
        })
      );

      await message.reply(`*Daftar Chat*\n\n${chatLines.join("\n\n")}`);
    });

    this.commands.set("send", async (message, args) => {
      if (args.length < 2) {
        await message.reply(
          "*Usage:*\n!send [nomor/groupId] [pesan]\n\n" +
          "*Contoh:*\n!send 6281234567890 Halo!\n" +
          "!send 1234567890@g.us Halo group!"
        );
        return;
      }

      const target = args[0];
      const text = args.slice(1).join(" ");
      const to = target.endsWith("@g.us")
        ? target
        : `${target.replace(/\D/g, "")}@c.us`;

      const contact = await message.getContact();
      const senderName = contact.pushname || contact.name || contact.number || message.from;
      const senderNumber = contact.number || contact.id.user || message.from;

      try {
        await whatsappService.sendMessage(to, text);
        logger.send(`pesan terkirim dari ${senderName} ke ${target}`);

        // Monitor ke group
        if (this.whatsappRedirectGroupId) {
          await whatsappService.sendMessage(
            this.whatsappRedirectGroupId,
            safeString(
              `*Pesan Terkirim*\n\n` +
              `*Dari*: ${senderName}\n` +
              `*Nomor*: +${senderNumber}\n\n` +
              `*Ke*: ${target}\n\n` +
              `*Pesan*:\n${text}`
            )
          );
        }

        await message.reply(`Pesan terkirim ke *${target}*`);
      } catch (err) {
        logger.error(`send error ke ${target}:`, err);
        await message.reply(`Gagal kirim ke *${target}*`);
      }
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

    this.commands.set("whoami", async (message) => {
      const contact = await message.getContact();
      await message.reply(
        `*Debug Info*\n\n` +
        `from: ${message.from}\n` +
        `number: ${contact.number}\n` +
        `pushname: ${contact.pushname}\n` +
        `name: ${contact.name}\n` +
        `id.user: ${contact.id.user}\n` +
        `id._serialized: ${contact.id._serialized}`
      );
    });
  }


  /** HELPER */
  private buildSenderHeader(senderName: string, senderNumber: string, type: string): string {
    return safeString(
      `*Pesan Masuk*\n\n` +
      `*Dari*: ${senderName}\n` +
      `*Nomor*: +${senderNumber}\n\n` +
      `*Tipe*: ${type.toUpperCase()}`
    );
  }

  private async sendHeaderMessage(senderName: string, senderNumber: string, type: string): Promise<void> {
    await whatsappService.sendMessage(
      this.whatsappRedirectGroupId!,
      this.buildSenderHeader(senderName, senderNumber, type),
    );
  }
}
