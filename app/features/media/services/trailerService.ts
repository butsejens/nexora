export function buildTrailerCandidates(value: unknown): string[] {
	const raw = String(value || "").trim();
	if (!raw) return [];
	if (/^[A-Za-z0-9_-]{6,}$/.test(raw)) return [raw];

	const out = new Set<string>();
	const pushIfValid = (candidate: string) => {
		const key = String(candidate || "").trim();
		if (/^[A-Za-z0-9_-]{6,}$/.test(key)) out.add(key);
	};

	try {
		const parsed = new URL(raw);
		pushIfValid(parsed.searchParams.get("v") || "");
		const parts = parsed.pathname.split("/").filter(Boolean);
		pushIfValid(parts[parts.length - 1] || "");
	} catch {
		const regex = /(?:v=|youtu\.be\/|embed\/|shorts\/)([A-Za-z0-9_-]{6,})/gi;
		let match: RegExpExecArray | null;
		while ((match = regex.exec(raw)) !== null) {
			pushIfValid(match[1] || "");
		}
	}

	return Array.from(out);
}
