import { fetchPlayer, type FetchPlayerParams } from "@/api/playerApi";
import type { MarketValuePoint, MarketValueResponse, ProviderName } from "@/types/data-layer";

function toEur(value: unknown): number | null {
  const raw = String(value || "").trim().toLowerCase().replace(/€/g, "").replace(/\s+/g, "");
  if (!raw) return null;
  const numeric = Number(raw.replace(/,/g, ".").replace(/[^\d.]/g, ""));
  if (!Number.isFinite(numeric)) return null;
  if (raw.includes("bn") || raw.includes("b")) return Math.round(numeric * 1_000_000_000);
  if (raw.includes("m")) return Math.round(numeric * 1_000_000);
  if (raw.includes("k")) return Math.round(numeric * 1_000);
  return Math.round(numeric);
}

function inferProvider(valueMethod: unknown): ProviderName {
  const method = String(valueMethod || "").toLowerCase();
  if (method.includes("transfermarkt")) return "transfermarkt-direct";
  if (method.includes("apify")) return "apify-transfermarkt";
  if (method.includes("api")) return "api-sports";
  return "fallback";
}

function normalizeHistory(player: any): MarketValuePoint[] {
  const items = Array.isArray(player?.formerClubs) ? player.formerClubs : [];
  const points: MarketValuePoint[] = [];
  for (const item of items) {
    const valueEur = toEur(item?.fee || item?.marketValue);
    if (!valueEur) continue;
    points.push({
      timestamp: String(item?.date || player?.updatedAt || new Date().toISOString()),
      valueEur,
      label: String(item?.fee || "").trim() || undefined,
      source: inferProvider(player?.valueMethod),
    });
  }
  return points;
}

export async function fetchMarketValue(params: FetchPlayerParams): Promise<MarketValueResponse> {
  const player = await fetchPlayer(params);
  const currentValueLabel = String(player?.marketValue || "").trim() || null;
  const currentValueEur = player?.marketValueEur || toEur(currentValueLabel);
  return {
    playerId: String(player?.id || params.playerId || "") || undefined,
    playerName: String(player?.name || params.name || "Player"),
    currentValueEur: currentValueEur || null,
    currentValueLabel,
    history: normalizeHistory(player),
    providerPriority: ["transfermarkt-direct", "apify-transfermarkt", "api-sports", "espn", "fallback"],
  };
}
