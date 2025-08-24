import { whatsappService } from "@/services/whatsapp.service";

export default async function whatsappInitialize() {
  await whatsappService.initialize();
}
