import { Message, List } from "whatsapp-web.js";
import { whatsappService } from "./whatsapp.service"; // gunakan service yang sudah ada
import { generateWaLink } from "@/helpers/generateWaLink";

export class WhatsAppBotService {
  private prefix: string = "!";
  private commands: Map<
    string,
    (message: Message, args: string[]) => Promise<void>
  > = new Map();

  constructor() {
    // Register commands di constructor
    this.registerCommands();

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

    this.commands.set("menu", async (message) => {
      const list = new List(
        "Pilih aksi di bawah ini 👇",
        "Lihat Menu",
        [
          {
            title: "SmartNet System",
            rows: [
              { id: "status_node", title: "📡 Status Node" },
              { id: "stat_harian", title: "📊 Statistik Harian" },
              { id: "chat_admin", title: "💬 Hubungi Admin" },
            ],
          },
        ],
        "SmartNet Bot",
        "powered by LoRa 🌾"
      );

      await message.reply(list);
    });

    // contoh command !help
    this.commands.set("help", async (message) => {
      const helpText = Array.from(this.commands.keys())
        .map((cmd) => `• !${cmd}`)
        .join("\n");

      await message.reply(`WhatsApp Bot Command\n${helpText}`);
    });
  }

  private listenIncomingMessages() {
    // kita intercept event dari whatsappService.client
    (whatsappService as any).client.on("message", async (message: Message) => {
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
          await message.reply(
            "⚠️ Terjadi kesalahan saat menjalankan perintah."
          );
        }
      } else {
        await message.reply(
          "❓ Perintah tidak dikenal. Ketik *!help* untuk daftar perintah."
        );
      }
    });
  }
}

// Export instance-nya biar bisa langsung digunakan
export const whatsappBotService = new WhatsAppBotService();
