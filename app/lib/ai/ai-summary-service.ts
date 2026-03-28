import { calculateMomentum } from "@/lib/ai/momentum-calculator";

type TimelineEvent = {
  minute?: number;
  time?: string;
  type?: string;
  kind?: string;
  detail?: string;
  team?: string;
  player?: string;
  text?: string;
};

export type MatchStoryInput = {
  homeTeam: string;
  awayTeam: string;
  homeScore: number;
  awayScore: number;
  timeline: TimelineEvent[];
  homeStats?: Record<string, unknown> | null;
  awayStats?: Record<string, unknown> | null;
};

export type MatchStory = {
  available: boolean;
  title: string;
  summary: string;
  turningPoint?: string;
  bullets: string[];
};

function normalizeText(event: TimelineEvent): string {
  return `${event?.type || ""} ${event?.kind || ""} ${event?.detail || ""} ${event?.text || ""}`.toLowerCase();
}

function minuteOf(event: TimelineEvent): number {
  const minute = Number(event?.minute);
  if (Number.isFinite(minute)) return minute;
  const fromTime = Number(String(event?.time || "").replace(/[^0-9]/g, ""));
  return Number.isFinite(fromTime) ? fromTime : 0;
}

function firstImportantEvent(events: TimelineEvent[]): TimelineEvent | null {
  const ordered = [...events].sort((a, b) => minuteOf(a) - minuteOf(b));
  return ordered.find((event) => {
    const text = normalizeText(event);
    return text.includes("goal") || text.includes("red") || text.includes("penalty") || text.includes("var");
  }) || null;
}

export function buildAiMatchStory(input: MatchStoryInput): MatchStory {
  const events = Array.isArray(input.timeline) ? input.timeline : [];
  const momentum = calculateMomentum({ homeStats: input.homeStats, awayStats: input.awayStats });

  if (!events.length && !momentum.hasData) {
    return {
      available: false,
      title: "AI Match Story",
      summary: "Nog onvoldoende live signalen om een betrouwbare story te genereren.",
      bullets: [],
    };
  }

  const firstKey = firstImportantEvent(events);
  const winner = input.homeScore === input.awayScore
    ? "in balans"
    : input.homeScore > input.awayScore
      ? `${input.homeTeam} met voorsprong`
      : `${input.awayTeam} met voorsprong`;

  const flowLine = momentum.hasData
    ? momentum.dominantSide === "balanced"
      ? "Het momentum bleef lang in evenwicht."
      : momentum.dominantSide === "home"
        ? `${input.homeTeam} duwde de match met aanhoudende druk naar zich toe.`
        : `${input.awayTeam} nam het initiatief met sterkere drukfases.`
    : "De flow werd vooral bepaald door sleutelacties in de timeline.";

  const turningPoint = firstKey
    ? `Kantelpunt rond ${minuteOf(firstKey)}': ${String(firstKey.detail || firstKey.type || firstKey.text || "belangrijk moment")}.`
    : undefined;

  const bullets: string[] = [];
  if (momentum.hasData) bullets.push(`Momentum ${momentum.homePct}% - ${momentum.awayPct}%`);
  if (events.length) bullets.push(`${events.length} relevante timeline-events verwerkt`);
  bullets.push(`Huidige stand: ${input.homeScore}-${input.awayScore} (${winner})`);

  return {
    available: true,
    title: "AI Match Story",
    summary: `${flowLine} ${turningPoint || ""}`.trim(),
    turningPoint,
    bullets,
  };
}
