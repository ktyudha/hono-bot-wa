import { Message, List, Buttons, MessageTypes } from "whatsapp-web.js";
import { whatsappService } from "./whatsapp.service"; // gunakan service yang sudah ada
import { generateWaLink } from "@/helpers/generateWaLink";
import { compressImage, compressVideo } from "@/helpers/media";
import { safeBody, safeString } from "@/helpers/general";

export class WhatsAppBotService {
  private client = (whatsappService as any).client;
  private whatsappRedirectGroupId = process.env.WHATSAPP_REDIRECT_GROUP_ID;
  private prefix: string = "!";
  private replyMap = new Map<string, string>();
  private commands: Map<
    string,
    (message: Message, args: string[]) => Promise<void>
  > = new Map();
  private liveLocationMap = new Map<
    string,
    {
      lastUpdate: number;
      groupMessageId: string;
    }
  >();

  private maxSizeVideo = 16; //Mb

  constructor() {
    // Register commands di constructor
    this.registerCommands();

    // Listen all message and forwarded to group
    this.listenIncomingToForwardedMessages();

    // Listen message dari WhatsAppService
    this.listenIncomingMessages();

    // Listen reply message dari group
    this.listenGroupReplies();
  }

  private registerCommands() {
    // contoh command !ping
    this.commands.set("ping", async (message) => {
      await message.reply("pong 🏓");
    });

    // contoh command !get-chat
    this.commands.set("get-chat", async (message) => {
      const chats = await whatsappService.getChats();
      const chatList = chats
        .filter((c) => c.id)
        .map((c) => generateWaLink(c.id))
        .slice(0, 10)
        .join("\n");

      await message.reply(`*Get Chat*\n${chatList}`);
    });

    // contoh command !help
    this.commands.set("help", async (message) => {
      const helpText = Array.from(this.commands.keys())
        .map((cmd) => `• !${cmd}`)
        .join("\n");

      await message.reply(`WhatsApp Bot Command\n${helpText}`);
    });

    // !battery
    this.commands.set("battery", async (message) => {
      const { battery, plugged } = await whatsappService.getBatteryStatus();

      const chargingText = plugged ? "Sedang di-charge" : "Tidak di-charge";

      await message.reply(
        `*Battery Status*\n` +
          `Level : ${battery}%\n` +
          `Status: ${chargingText}`
      );
    });

    // !location
    this.commands.set("location", async (message) => {
      let location = message.location;

      // kalau reply lokasi
      if (!location && message.hasQuotedMsg) {
        const quoted = await message.getQuotedMessage();
        location = quoted.location;
      }

      if (!location) {
        await message.reply(
          "Kirim lokasi atau *reply pesan lokasi* lalu ketik `!location`."
        );
        return;
      }
      const {
        latitude,
        longitude,
        address,
        name,
        description,
        accuracy,
        speed,
        degrees,
      } = location as any;

      await message.reply(
        `*Location Received*\n\n` +
          `Lat: ${latitude}\n` +
          `Lng: ${longitude}\n` +
          (accuracy ? `Accuracy: ${accuracy} m\n` : "") +
          (speed ? `Speed: ${speed}\n` : "") +
          (degrees ? `Direction: ${degrees}\n` : "") +
          (address ? `\nAddress: ${address}` : "")
      );
    });
  }

  private listenIncomingMessages() {
    // kita intercept event dari whatsappService.client
    this.client.on("message", async (message: Message) => {
      const body = safeBody(message.body, "");
      if (!body.startsWith(this.prefix)) return;

      const [cmd, ...args] = body.slice(1).split(" ");
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
          "Perintah tidak dikenal.\nKetik *!help* untuk daftar perintah."
        );
      }
    });
  }

  private listenIncomingToForwardedMessages() {
    this.client.on("message", async (message: Message) => {
      if (!this.whatsappRedirectGroupId) {
        console.error(
          "[BOT] Redirect: WhatsApp redirect groupId is not valid!"
        );
        return;
      }

      if (message.from == this.whatsappRedirectGroupId) return;

      // only redirect chats, not group
      if (message.from.endsWith("@g.us")) return;

      try {
        const senderId = message.from;
        const senderLabel = senderId.endsWith("@lid")
          ? senderId
          : senderId.replace(/\D/g, "");

        if (!message.body && !message.hasMedia && !message.location) {
          console.log("[BOT] Skip empty/system message");
          return;
        }

        // location
        const type = message.type as string;
        if (type === MessageTypes.LOCATION || type === "live_location") {
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
            (loc.accuracy ? `Accuracy: ${loc.accuracy} m\n` : "") +
            (loc.address ? `Address: ${loc.address}\n` : "") +
            `\n${mapsUrl}`;

          const existing = this.liveLocationMap.get(senderId);

          // live location
          if (isLive && existing) {
            await this.client.sendMessage(
              this.whatsappRedirectGroupId,
              `*Update Lokasi*\n\n${text}`
            );

            existing.lastUpdate = now;
            return;
          }

          // location
          const sentMessage = await this.client.sendMessage(
            this.whatsappRedirectGroupId,
            text
          );

          this.replyMap.set(sentMessage.id._serialized, senderId);

          if (isLive) {
            this.liveLocationMap.set(senderId, {
              lastUpdate: now,
              groupMessageId: sentMessage.id._serialized,
            });
          }

          return;
        }

        // message
        if (!message.hasMedia) {
          const bodyText = safeBody(message.body);

          const textMessage =
            `*Pesan Masuk*\n\n` +
            `*Dari*:\n${senderLabel}\n\n` +
            `*Pesan*:\n${bodyText}`;

          const sentMessage = await this.client.sendMessage(
            this.whatsappRedirectGroupId,
            safeString(textMessage)
          );

          // save map
          this.replyMap.set(sentMessage.id._serialized, senderId);
          return;
        }

        // message media
        const media = await message.downloadMedia();

        if (!media || !media.data || !media.mimetype) {
          console.warn("[BOT] Failed to download media for reply");
          return;
        }

        // IMAGE
        let sendMedia = media;
        if (message.type === "image") {
          const compressed = await compressImage(media.data);
          sendMedia = {
            mimetype: "image/jpeg",
            data: compressed,
            filename: "image.jpg",
          };
        }

        // VIDEO
        if (message.type === "video") {
          const sizeMB = Buffer.from(media.data, "base64").length / 1024 / 1024;

          if (sizeMB <= this.maxSizeVideo) {
            const compressed = await compressVideo(media.data);
            sendMedia = {
              mimetype: "video/mp4",
              data: compressed,
              filename: "video.mp4",
            };
          } else {
            sendMedia = media;
          }
        }

        const caption =
          `*Pesan Media*\n\n` +
          `*Dari*:\n${senderLabel}\n\n` +
          `*Tipe*:\n${message.type.toUpperCase()}\n\n` +
          (message.body ? `*Caption*:\n${safeBody(message.body)}` : "");

        if (!sendMedia || !sendMedia.data || !sendMedia.mimetype) {
          console.warn("[BOT] Forward skipped: invalid media");
          return;
        }

        const sentMessage = await this.client.sendMessage(
          this.whatsappRedirectGroupId,
          sendMedia,
          {
            caption: safeString(caption),
            sendMediaAsDocument: message.type === "video",
          }
        );

        this.replyMap.set(sentMessage.id._serialized, senderId);
      } catch (err) {
        console.error("[BOT] Redirect: Error - ", err);
      }
    });
  }

  private listenGroupReplies() {
    this.client.on("message", async (message: Message) => {
      // hanya pesan dari group redirect
      if (message.from !== this.whatsappRedirectGroupId) return;

      // harus reply
      if (!message.hasQuotedMsg) return;

      try {
        const quoted = await message.getQuotedMessage();
        const quotedId = quoted.id._serialized;

        const targetSender = this.replyMap.get(quotedId);
        if (!targetSender) {
          console.warn("[BOT] Reply target not found");
          return;
        }

        // media
        if (message.hasMedia) {
          const media = await message.downloadMedia();
          if (!media || !media.data || !media.mimetype) {
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

        // kirim balasan ke user asli
        await this.client.sendMessage(
          targetSender,
          safeBody(`*Balasan Admin*\n\n${message.body}`)
        );
      } catch (err) {
        console.error("[BOT] Reply Error:", err);
      }
    });
  }
}

// Export instance-nya biar bisa langsung digunakan
export const whatsappBotService = new WhatsAppBotService();
