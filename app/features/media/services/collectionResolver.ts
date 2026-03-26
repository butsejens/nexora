export function resolveCollectionIdentity(value: unknown): string {
	return String(value || "").trim();
}
