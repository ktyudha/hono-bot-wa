export function generateWaLink(to: string, text?: string): string {
  const formattedNumber = to
    .replace(/\D/g, "")
    .replace(/^0/, "62")
    .replace(/^(\+62)/, "62")
    .replace(/@c\.us$/, "");

  const encodedText = text ? `?text=${encodeURIComponent(text)}` : "";
  return `https://wa.me/${formattedNumber}${encodedText}`;
}
