type SourcePolicyDocument = {
  aliases?: Record<string, string>;
  priorityOrder?: Record<string, string[]>;
};

// Inline defaults — the shared JSON was removed with the sports module.
const sourcePolicyJson: SourcePolicyDocument = {
  aliases: {},
  priorityOrder: {},
};

export type PlayerPhotoFieldType =
  | "lineup-player-photo"
  | "player-profile-photo";

export type PhotoSourceCandidate = {
  url: string | null | undefined;
  source?: string | null;
};

const sourcePolicy = sourcePolicyJson;

export const DEFAULT_PLAYER_PHOTO_FIELD: PlayerPhotoFieldType =
  "player-profile-photo";

function normalizeText(value: unknown): string {
  return String(value ?? "")
    .trim()
    .toLowerCase()
    .replace(/_/g, "-");
}

function decodeProxiedUrl(url: string): string {
  try {
    const parsed = new URL(url, "https://nexora.local");
    const nested = parsed.searchParams.get("url");
    if (nested && /^https?:\/\//i.test(nested)) return nested;
  } catch {
    return url;
  }
  return url;
}

export function normalizePolicySource(source: unknown): string {
  const normalized = normalizeText(source);
  if (!normalized) return "";
  return sourcePolicy.aliases?.[normalized] || normalized;
}

export function isTrustedPhotoUrl(url: unknown): url is string {
  if (typeof url !== "string") return false;
  const trimmed = url.trim();
  if (!trimmed) return false;
  const decoded = decodeProxiedUrl(trimmed);
  if (!/^https?:\/\//i.test(decoded) && !trimmed.startsWith("/api/")) {
    return false;
  }
  return !/wikipedia|wikimedia|wikidata|ui-avatars\.com|gravatar/i.test(
    decoded,
  );
}

export function classifyPhotoSource(
  url: string | null | undefined,
  explicitSource?: string | null,
): string {
  const explicit = normalizePolicySource(explicitSource);
  if (explicit && explicit !== "server") return explicit;

  const decoded = decodeProxiedUrl(String(url ?? "").trim());
  if (!decoded) return explicit || "server";
  if (/api\.sofascore\./i.test(decoded)) return "sofascore";
  if (/a\.espncdn\.com\/i\/headshots\//i.test(decoded)) return "espn";
  if (/thesportsdb\.com/i.test(decoded)) return "thesportsdb";
  if (/transfermarkt/i.test(decoded)) return "transfermarkt";
  return explicit || "server";
}

export function getSourcePriority(
  priorityKey: string,
  source: string | null | undefined,
): number {
  const order = Array.isArray(sourcePolicy.priorityOrder?.[priorityKey])
    ? sourcePolicy.priorityOrder?.[priorityKey]!.map((entry) =>
        normalizePolicySource(entry),
      )
    : [];
  const normalizedSource = normalizePolicySource(source);
  const index = order.indexOf(normalizedSource);
  return index === -1 ? order.length + 100 : index;
}

export function chooseBestPhotoCandidate(
  fieldType: PlayerPhotoFieldType,
  candidates: PhotoSourceCandidate[],
): { url: string; source: string } | null {
  const normalized = candidates
    .map((candidate) => {
      const url = String(candidate?.url ?? "").trim();
      if (!isTrustedPhotoUrl(url)) return null;
      return {
        url,
        source: classifyPhotoSource(url, candidate?.source),
      };
    })
    .filter(Boolean) as Array<{ url: string; source: string }>;

  normalized.sort(
    (left, right) =>
      getSourcePriority(fieldType, left.source) -
      getSourcePriority(fieldType, right.source),
  );

  return normalized[0] ?? null;
}

export function sortPhotoCandidates(
  fieldType: PlayerPhotoFieldType,
  candidates: PhotoSourceCandidate[],
): Array<{ url: string; source: string }> {
  return candidates
    .map((candidate) => {
      const url = String(candidate?.url ?? "").trim();
      if (!isTrustedPhotoUrl(url)) return null;
      return {
        url,
        source: classifyPhotoSource(url, candidate?.source),
      };
    })
    .filter(Boolean)
    .sort(
      (left, right) =>
        getSourcePriority(fieldType, left!.source) -
        getSourcePriority(fieldType, right!.source),
    ) as Array<{ url: string; source: string }>;
}
