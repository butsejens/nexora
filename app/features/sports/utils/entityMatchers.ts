export function normalizeEntityKey(value: unknown): string {
  return String(value || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]/g, "");
}

export function entityMatch(a: unknown, b: unknown): boolean {
  return normalizeEntityKey(a) === normalizeEntityKey(b);
}
