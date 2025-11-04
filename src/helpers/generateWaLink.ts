import { formatPhoneNumber } from "./formatPhoneNumber";

export function generateWaLink(to: string): string {
  const cleanNumber = to.replace(/@c\.us|@g\.us/gi, "");
  return `https://wa.me/${cleanNumber}`;
}
