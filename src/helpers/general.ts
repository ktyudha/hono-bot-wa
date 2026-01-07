export function safeString(input: any) {
  if (typeof input !== "string" || !input.trim()) return "-";
  return input;
}
