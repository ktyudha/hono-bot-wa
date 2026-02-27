import { whatsappService } from "@/services/whatsapp.service";
import { WhatsAppBotService } from "@/services/whatsappBot.service";
import { log } from "@/helpers/logger";

export default async function whatsappInitialize() {
  await whatsappService.initialize();

  new WhatsAppBotService();
  log.bot("bot is now active");
}
