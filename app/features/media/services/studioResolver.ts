export function resolveStudioIdentity(value: unknown): string {
	return String(value || "").trim();
}
