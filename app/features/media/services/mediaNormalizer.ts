export function normalizeMediaType(value: unknown): "movie" | "series" {
	const text = String(value || "").toLowerCase();
	return text === "series" || text === "tv" || text === "show" ? "series" : "movie";
}
