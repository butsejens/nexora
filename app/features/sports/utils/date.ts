export function toYmd(date: Date): string {
  return date.toISOString().slice(0, 10);
}

export function addDays(ymd: string, delta: number): string {
  const d = new Date(`${ymd}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + delta);
  return toYmd(d);
}
