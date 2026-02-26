import { whatsappService } from "@/services/whatsapp.service";
import { WhatsAppBotService } from "@/services/whatsappBot.service";
import { logger } from "@/helpers/logger";

export default async function whatsappInitialize() {
  await whatsappService.initialize();

  new WhatsAppBotService();
  logger.bot("bot is now active");
}
