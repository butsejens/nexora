export function resolveEspnLeagueForMatch(match: any): string {
	const league = String(match?.espnLeague || "").trim();
	return league || "eng.1";
}
