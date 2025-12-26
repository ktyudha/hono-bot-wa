import { whatsappService } from "@/services/whatsapp.service";
import { WhatsAppBotService } from "@/services/whatsappBot.service";

export default async function whatsappInitialize() {
  await whatsappService.initialize();

  new WhatsAppBotService();
  console.log("[INIT] WhatsApp bot is now active");
}
