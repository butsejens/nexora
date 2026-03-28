type HighlightItem = Record<string, any>;

type HighlightSelectionInput = {
  highlights: HighlightItem[];
  favoriteTeams?: string[];
  preferredLeagues?: string[];
};

export type RankedHighlight = {
  item: HighlightItem;
  score: number;
  reasons: string[];
};

function normalize(value: unknown): string {
  return String(value || "").trim().toLowerCase();
}

function titleTokens(item: HighlightItem): string {
  return `${item?.title || ""} ${item?.competition || ""} ${item?.homeTeam || ""} ${item?.awayTeam || ""}`.toLowerCase();
}

function hasPlayableSource(item: HighlightItem): boolean {
  const embedUrl = String(item?.embedUrl || "").trim();
  const matchUrl = String(item?.matchUrl || "").trim();
  return Boolean(embedUrl || matchUrl);
}

export function selectHighlightsForFeed(input: HighlightSelectionInput): RankedHighlight[] {
  const favoriteTeams = (input.favoriteTeams || []).map(normalize).filter(Boolean);
  const preferredLeagues = (input.preferredLeagues || []).map(normalize).filter(Boolean);

  return (Array.isArray(input.highlights) ? input.highlights : [])
    .filter(hasPlayableSource)
    .map((item) => {
      const reasons: string[] = [];
      const tokenBag = titleTokens(item);
      let score = 20;

      if (/goal|penalty|winner|equali|red card|extra time|derby/i.test(tokenBag)) {
        score += 16;
        reasons.push("Key moment");
      }

      if (/highlights|extended|recap/i.test(tokenBag)) {
        score += 8;
      }

      if (favoriteTeams.some((team) => tokenBag.includes(team))) {
        score += 24;
        reasons.push("Favorite team highlight");
      }

      if (preferredLeagues.some((league) => tokenBag.includes(league))) {
        score += 12;
        reasons.push("Preferred competition");
      }

      const dateTs = Date.parse(String(item?.date || ""));
      if (Number.isFinite(dateTs)) {
        const ageHours = Math.max(0, (Date.now() - dateTs) / 3_600_000);
        score += Math.max(0, 18 - ageHours);
      }

      if (!reasons.length) reasons.push("Top recent clip");

      return { item, score, reasons: reasons.slice(0, 2) };
    })
    .sort((left, right) => right.score - left.score);
}
