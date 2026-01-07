export function safeString(input: any) {
  if (typeof input !== "string" || !input.trim()) return "-";
  return input;
}

export function safeBody(value: any, fallback = "-"): string {
  if (typeof value !== "string") return fallback;

  const cleaned = value
    .replace(/[\u0000-\u001F\u007F-\u009F]/g, "") // control chars
    .replace(/\u200B|\u200C|\u200D|\uFEFF/g, "") // zero-width
    .trim();

  return cleaned.length > 0 ? cleaned : fallback;
}
