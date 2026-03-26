export function buildTrailerCandidates(value: unknown): string[] {
	const raw = String(value || "").trim();
	return raw ? [raw] : [];
}
