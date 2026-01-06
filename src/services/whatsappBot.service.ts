import { Message, List, Buttons } from "whatsapp-web.js";
import { whatsappService } from "./whatsapp.service"; // gunakan service yang sudah ada
import { generateWaLink } from "@/helpers/generateWaLink";

export class WhatsAppBotService {
  private client = (whatsappService as any).client;
  private whatsappRedirectGroupId = process.env.WHATSAPP_REDIRECT_GROUP_ID;
  private prefix: string = "!";
  private commands: Map<
    string,
    (message: Message, args: string[]) => Promise<void>
  > = new Map();

  constructor() {
    // Register commands di constructor
    this.registerCommands();

    // Listen all message and forwarded to group
    this.listenIncomingToForwardedMessages();

    // Listen message dari WhatsAppService
    this.listenIncomingMessages();
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
      const { latitude, longitude, address, name, description } =
        message.location;

      await message.reply(
        `Location:\nLatitude:${latitude}\nLongitude:${longitude}\n\nAddress:${address}\nName:${name}\nDescription:${description}`
      );
    });
  }

  private listenIncomingMessages() {
    // kita intercept event dari whatsappService.client
    this.client.on("message", async (message: Message) => {
      const body = message.body.trim();
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
        const number = message.from.replace("@c.us", "");

        // message
        if (!message.hasMedia) {
          const textMessage =
            `*Pesan Masuk*\n\n` +
            `*Dari*:\n${number}\n\n` +
            `*Pesan*:\n${message.body || "-"}`;

          await this.client.sendMessage(
            this.whatsappRedirectGroupId,
            textMessage
          );
          return;
        }

        // message media
        const media = await message.downloadMedia();

        if (!media) {
          console.error("[BOT] Media download failed");
          return;
        }

        const caption =
          `*Pesan Media*\n\n` +
          `*Dari*:\n${number}\n\n` +
          `*Tipe*:\n${message.type.toUpperCase()}\n\n` +
          (message.body ? `*Caption*:\n${message.body}` : "");

        await this.client.sendMessage(this.whatsappRedirectGroupId, media, {
          caption,
        });

        // await message.forward(this.whatsappRedirectGroupId);
      } catch (err) {
        console.error("[BOT] Redirect: Error - ", err);
      }
    });
  }
}

// Export instance-nya biar bisa langsung digunakan
export const whatsappBotService = new WhatsAppBotService();
