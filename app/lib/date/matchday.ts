const DEFAULT_TIME_ZONE = "Europe/Brussels";

function datePartsInZone(date: Date, timeZone: string): { year: number; month: number; day: number } {
  const fmt = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  const parts = fmt.formatToParts(date);
  const y = Number(parts.find((p) => p.type === "year")?.value || 0);
  const m = Number(parts.find((p) => p.type === "month")?.value || 0);
  const d = Number(parts.find((p) => p.type === "day")?.value || 0);
  return { year: y, month: m, day: d };
}

export function getMatchdayYmd(date: Date = new Date(), timeZone = DEFAULT_TIME_ZONE): string {
  const { year, month, day } = datePartsInZone(date, timeZone);
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

export function shiftYmd(ymd: string, days: number): string {
  const [y, m, d] = String(ymd || "").split("-").map(Number);
  if (!Number.isFinite(y) || !Number.isFinite(m) || !Number.isFinite(d)) return ymd;
  const dt = new Date(Date.UTC(y, m - 1, d));
  dt.setUTCDate(dt.getUTCDate() + days);
  return dt.toISOString().slice(0, 10);
}

export function classifyRelativeDay(targetYmd: string, referenceYmd: string): "yesterday" | "today" | "tomorrow" | "other" {
  if (!targetYmd || !referenceYmd) return "other";
  if (targetYmd === referenceYmd) return "today";
  if (targetYmd === shiftYmd(referenceYmd, -1)) return "yesterday";
  if (targetYmd === shiftYmd(referenceYmd, 1)) return "tomorrow";
  return "other";
}

export function getDeviceTimeZone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || DEFAULT_TIME_ZONE;
  } catch {
    return DEFAULT_TIME_ZONE;
  }
}
