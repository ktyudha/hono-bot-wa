import "whatsapp-web.js";

declare module "whatsapp-web.js" {
  interface Location {
    accuracy?: number;
    address?: string;
  }
}
