import { formatPhoneNumber } from "./formatPhoneNumber";

export function generateWaLink(to: string): string {
  const formattedNumber = formatPhoneNumber(to);
  return `https://wa.me/${formattedNumber}`;
}
