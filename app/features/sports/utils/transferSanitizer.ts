export function sanitizeTransferText(value: unknown): string {
  const text = String(value || "").replace(/\s+/g, " ").trim();
  return text.replace(/<[^>]*>/g, "");
}
