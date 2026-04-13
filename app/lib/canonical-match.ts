import { resolveMatchBucket } from "@/lib/match-state";

export type CanonicalStatus = "upcoming" | "live" | "finished" | "postponed" | "cancelled";

export type CanonicalMatch = {
	id: string;
	homeTeam: string;
	awayTeam: string;
	homeTeamLogo?: string | null;
	awayTeamLogo?: string | null;
	homeScore: number;
	awayScore: number;
	status: CanonicalStatus;
	statusDetail: string;
	minute?: number | null;
	startDate?: string | null;
	startTime?: string;
	league: string;
	espnLeague: string;
	sport: string;
};

function toToken(value: unknown): string {
	return String(value || "")
		.toLowerCase()
		.trim()
		.replace(/[^a-z0-9]+/g, "_")
		.replace(/^_+|_+$/g, "");
}

function toNumber(value: unknown, fallback = 0): number {
	const n = Number(value);
	return Number.isFinite(n) ? n : fallback;
}

function parseMinute(value: unknown): number | null {
	const numeric = Number(value);
	if (Number.isFinite(numeric) && numeric >= 0) return numeric;
	const mm = String(value || "").match(/\d{1,3}/);
	if (!mm) return null;
	const parsed = Number(mm[0]);
	return Number.isFinite(parsed) ? parsed : null;
}

function inferCanonicalStatus(input: {
	status?: unknown;
	detail?: unknown;
	minute?: unknown;
	homeScore?: unknown;
	awayScore?: unknown;
	startDate?: unknown;
}): CanonicalStatus {
	const statusToken = toToken(input.status);
	const detailToken = toToken(input.detail);

	if (
		statusToken.includes("postpon") ||
		detailToken.includes("postpon") ||
		detailToken.includes("afgelast") ||
		detailToken.includes("abandon")
	) {
		return "postponed";
	}

	if (
		statusToken.includes("cancel") ||
		detailToken.includes("cancel")
	) {
		return "cancelled";
	}

	const bucket = resolveMatchBucket({
		status: input.status,
		detail: input.detail,
		minute: input.minute,
		homeScore: input.homeScore,
		awayScore: input.awayScore,
		startDate: input.startDate,
	});

	if (bucket === "live") return "live";
	if (bucket === "finished") return "finished";
	return "upcoming";
}

function inferStartTime(raw: any): string {
	const direct = String(raw?.startTime || raw?.kickoff || "").trim();
	if (direct && /\d{1,2}:\d{2}/.test(direct)) {
		const m = direct.match(/\d{1,2}:\d{2}/);
		return m ? m[0] : "";
	}
	const iso = String(raw?.startDate || raw?.date || "").trim();
	if (!iso) return "";
	const dt = new Date(iso);
	if (Number.isNaN(dt.getTime())) return "";
	return dt.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

export function toCanonicalMatch(raw: any): CanonicalMatch | null {
	if (!raw) return null;
	const id = String(raw?.id || raw?.matchId || raw?.espnId || "").trim();
	if (!id) return null;

	const homeTeam = String(raw?.homeTeam?.name || raw?.homeTeamName || raw?.homeTeam || "").trim();
	const awayTeam = String(raw?.awayTeam?.name || raw?.awayTeamName || raw?.awayTeam || "").trim();
	if (!homeTeam || !awayTeam) return null;

	const homeScore = toNumber(raw?.score?.home ?? raw?.homeScore ?? raw?.homeTeam?.score, 0);
	const awayScore = toNumber(raw?.score?.away ?? raw?.awayScore ?? raw?.awayTeam?.score, 0);
	const minute = parseMinute(raw?.minute ?? raw?.clock ?? raw?.displayClock);
	const startDate = String(raw?.startDate || raw?.date || raw?.startTime || "").trim() || null;
	const statusDetail = String(raw?.statusDetail || raw?.detail || raw?.status || "").trim();

	const status = inferCanonicalStatus({
		status: raw?.status,
		detail: raw?.statusDetail ?? raw?.detail,
		minute,
		homeScore,
		awayScore,
		startDate,
	});

	return {
		id,
		homeTeam,
		awayTeam,
		homeTeamLogo: raw?.homeTeamLogo || raw?.homeTeam?.logo || null,
		awayTeamLogo: raw?.awayTeamLogo || raw?.awayTeam?.logo || null,
		homeScore,
		awayScore,
		status,
		statusDetail,
		minute,
		startDate,
		startTime: inferStartTime(raw),
		league: String(raw?.league || raw?.leagueName || raw?.competition?.displayName || "").trim(),
		espnLeague: String(raw?.espnLeague || raw?.competition?.espnSlug || "").trim(),
		sport: String(raw?.sport || "football").trim() || "football",
	};
}

function scoreCompleteness(match: CanonicalMatch): number {
	let score = 0;
	if (match.status === "finished") score += 6;
	else if (match.status === "live") score += 5;
	else if (match.status === "upcoming") score += 3;
	else score += 1;

	if (match.homeScore > 0 || match.awayScore > 0) score += 2;
	if (match.minute != null && match.minute > 0) score += 1;
	if (match.homeTeamLogo) score += 1;
	if (match.awayTeamLogo) score += 1;
	if (match.startDate) score += 1;
	if (match.statusDetail) score += 1;
	return score;
}

function mergeTwoMatches(a: CanonicalMatch, b: CanonicalMatch): CanonicalMatch {
	const best = scoreCompleteness(b) >= scoreCompleteness(a) ? b : a;
	const fallback = best === a ? b : a;
	return {
		...best,
		homeTeamLogo: best.homeTeamLogo || fallback.homeTeamLogo || null,
		awayTeamLogo: best.awayTeamLogo || fallback.awayTeamLogo || null,
		league: best.league || fallback.league,
		espnLeague: best.espnLeague || fallback.espnLeague,
		sport: best.sport || fallback.sport,
		startDate: best.startDate || fallback.startDate,
		startTime: best.startTime || fallback.startTime,
		statusDetail: best.statusDetail || fallback.statusDetail,
		minute: best.minute ?? fallback.minute ?? null,
	};
}

export function dedupeCanonicalMatches(matches: CanonicalMatch[]): CanonicalMatch[] {
	const byId = new Map<string, CanonicalMatch>();
	for (const match of matches || []) {
		if (!match?.id) continue;
		const existing = byId.get(match.id);
		if (!existing) {
			byId.set(match.id, match);
			continue;
		}
		byId.set(match.id, mergeTwoMatches(existing, match));
	}
	return [...byId.values()];
}

function isSameUtcDate(isoDate: string | null | undefined, ymd: string): boolean {
	if (!isoDate || !ymd) return false;
	const dt = new Date(isoDate);
	if (Number.isNaN(dt.getTime())) return false;
	return dt.toISOString().slice(0, 10) === ymd;
}

export function partitionForHomeSections(matches: CanonicalMatch[], selectedDateYmd: string): {
	liveNow: CanonicalMatch[];
	today: CanonicalMatch[];
	finished: CanonicalMatch[];
	postponedOrCancelled: CanonicalMatch[];
} {
	const unique = dedupeCanonicalMatches(matches);
	const liveNow: CanonicalMatch[] = [];
	const today: CanonicalMatch[] = [];
	const finished: CanonicalMatch[] = [];
	const postponedOrCancelled: CanonicalMatch[] = [];

	for (const match of unique) {
		if (match.status === "live") {
			liveNow.push(match);
			continue;
		}
		if (match.status === "finished") {
			finished.push(match);
			continue;
		}
		if (match.status === "postponed" || match.status === "cancelled") {
			postponedOrCancelled.push(match);
			continue;
		}
		if (isSameUtcDate(match.startDate, selectedDateYmd)) {
			today.push(match);
		}
	}

	return { liveNow, today, finished, postponedOrCancelled };
}

export function toLegacyMatchCard(match: CanonicalMatch): any {
	return {
		id: match.id,
		homeTeam: match.homeTeam,
		awayTeam: match.awayTeam,
		homeTeamLogo: match.homeTeamLogo || "",
		awayTeamLogo: match.awayTeamLogo || "",
		homeScore: match.homeScore,
		awayScore: match.awayScore,
		status: match.status,
		minute: match.minute ?? undefined,
		startDate: match.startDate || undefined,
		startTime: match.startTime || "",
		league: match.league,
		espnLeague: match.espnLeague,
		sport: match.sport,
	};
}

