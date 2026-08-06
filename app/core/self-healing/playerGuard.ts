import type { PlayerGuardInput } from "./types";

export type PlayerGuardResult =
  | { ok: true }
  | { ok: false; message: string; suggestion: string };

export function validateBeforePlay(input: PlayerGuardInput): PlayerGuardResult {
  const id = String(input.id || "").trim();
  const type = String(input.type || "").trim().toLowerCase();
  const source = String(input.sourceUrl || "").trim();
  const allowedTypes = new Set(["movie", "series", "tv", "live"]);

  if (!id) {
    return {
      ok: false,
      message: "Deze content heeft geen geldig ID.",
      suggestion: "Open een ander item of probeer opnieuw.",
    };
  }
  if (!type || !allowedTypes.has(type)) {
    return {
      ok: false,
      message: "Onbekend contenttype voor afspelen.",
      suggestion: "Ga terug naar home en open de titel opnieuw.",
    };
  }
  if (source && !/^https?:\/\//i.test(source)) {
    return {
      ok: false,
      message: "Afspeelbron is ongeldig.",
      suggestion: "Kies een andere server of herstart de app.",
    };
  }

  return { ok: true };
}
