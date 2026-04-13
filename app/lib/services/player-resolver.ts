import AsyncStorage from "@react-native-async-storage/async-storage";
import { apiRequest } from "@/lib/query-client";
import { enrichPlayerProfilePayload } from "@/lib/sports-enrichment";
import { getCachedPhoto, seedPlayerPhotos } from "@/lib/image-resolver";
import { normalizePlayerMarketValue } from "@/lib/domain/normalizers";
import { chooseBestPhotoCandidate } from "@/lib/source-policy";
import {
  resolveFromSources,
  scoreByFilledFields,
  type ResolverMeta,
} from "@/lib/services/sports-resolver";

const PLAYER_PROFILE_CACHE_KEY = "nexora_player_profiles_v1";
const PLAYER_PROFILE_TTL = 6 * 60 * 60 * 1000;
const MAX_PROFILE_CACHE_ENTRIES = 600;

export interface PlayerProfileParams {
  playerId: string;
  name?: string;
  team?: string;
  league?: string;
  sport?: string;
  photo?: string | null;
  theSportsDbPhoto?: string | null;
  marketValue?: string | null;
  age?: string | number | null;
  height?: string | null;
  weight?: string | null;
  position?: string | null;
  nationality?: string | null;
}

export interface ResolvedPlayerProfile {
  id: string;
  espnId?: string | null;
  name: string;
  firstName?: string;
  lastName?: string;
  age?: number | null;
  birthDate?: string | null;
  nationality?: string | null;
  position?: string | null;
  positionAbbr?: string | null;
  height?: string | null;
  weight?: string | null;
  shirtNumber?: number | null;
  jerseyNumber?: string | null;
  foot?: "left" | "right" | "both" | null;
  currentClub?: string | null;
  currentClubLogo?: string | null;
  teamId?: string | null;
  teamName?: string | null;
  league?: string | null;
  marketValue?: string | null;
  marketValueNumeric?: number | null;
  marketValueHistory?: Array<Record<string, unknown>>;
  valueSource?: string | null;
  valueMethod?: string | null;
  isRealValue?: boolean;
  photo?: string | null;
  photoSource?: string | null;
  photoCandidates?: Array<{ url: string; source: string }>;
  theSportsDbPhoto?: string | null;
  image?: { uri: string; source: string; confidence: number } | null;
  seasonStats?: Record<string, number | null> | null;
  formerClubs?: any[];
  strengths?: string[];
  weaknesses?: string[];
  analysis?: string | null;
  recentForm?: any;
  profileMeta?: any;
  contractUntil?: string | null;
  source?: string | null;
  updatedAt?: string | null;
  offlineData?: boolean;
  resolver?: {
    cache: "hit" | "miss";
    profile: ResolverMeta;
    value: ResolverMeta;
    missingFields: string[];
    finalPhotoUrl: string | null;
    finalValueSource: string | null;
  };
}

type CachedProfileEntry = {
  data: ResolvedPlayerProfile;
  ts: number;
};

const profileCache = new Map<string, CachedProfileEntry>();
const inflightProfiles = new Map<
  string,
  Promise<ResolvedPlayerProfile | null>
>();
let cacheHydrated = false;
let persistTimer: ReturnType<typeof setTimeout> | null = null;

function normalizeLookupText(value: unknown): string {
  return String(value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/gi, " ")
    .toLowerCase()
    .trim();
}

function ensureText(value: unknown): string {
  return String(value ?? "").trim();
}

function isMeaningfulText(value: unknown): boolean {
  const text = ensureText(value).toLowerCase();
  if (!text) return false;
  return ![
    "n/a",
    "na",
    "unknown",
    "null",
    "undefined",
    "none",
    "-",
    "not available",
  ].includes(text);
}

function toNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  const raw = ensureText(value);
  if (!raw) return null;
  const parsed = Number(raw.replace(/,/g, ".").replace(/[^\d.-]/g, ""));
  return Number.isFinite(parsed) ? parsed : null;
}

function normalizeFoot(value: unknown): "left" | "right" | "both" | null {
  const text = normalizeLookupText(value);
  if (!text) return null;
  if (text.includes("left")) return "left";
  if (text.includes("right")) return "right";
  if (text.includes("both") || text.includes("two foot")) return "both";
  return null;
}

function parseMarketValueNumeric(value: unknown): number | null {
  const text = ensureText(value)
    .toLowerCase()
    .replace(/€/g, "")
    .replace(/\s+/g, "");
  if (!text) return null;
  const amount = Number(text.replace(/,/g, ".").replace(/[^\d.]/g, ""));
  if (!Number.isFinite(amount) || amount <= 0) return null;
  if (text.includes("bn") || text.includes("b"))
    return Math.round(amount * 1_000_000_000);
  if (text.includes("m")) return Math.round(amount * 1_000_000);
  if (text.includes("k")) return Math.round(amount * 1_000);
  return Math.round(amount);
}

function buildPlayerCacheKey(params: PlayerProfileParams): string {
  return [
    ensureText(params.playerId) || "unknown",
    normalizeLookupText(params.name),
    normalizeLookupText(params.team),
    normalizeLookupText(params.league),
    normalizeLookupText(params.sport || "soccer"),
  ].join("|");
}

async function hydrateProfileCache(): Promise<void> {
  if (cacheHydrated) return;
  cacheHydrated = true;
  try {
    const raw = await AsyncStorage.getItem(PLAYER_PROFILE_CACHE_KEY);
    if (!raw) return;
    const entries = JSON.parse(raw) as [string, CachedProfileEntry][];
    const now = Date.now();
    for (const [key, entry] of entries) {
      if (
        !key ||
        !entry?.data ||
        now - Number(entry.ts || 0) > PLAYER_PROFILE_TTL
      ) {
        continue;
      }
      profileCache.set(key, entry);
    }
  } catch {
    // best-effort cache hydration
  }
}

function schedulePersist(): void {
  if (persistTimer) return;
  persistTimer = setTimeout(async () => {
    persistTimer = null;
    try {
      const sorted = [...profileCache.entries()]
        .filter(([, entry]) => Date.now() - entry.ts < PLAYER_PROFILE_TTL)
        .sort((a, b) => b[1].ts - a[1].ts)
        .slice(0, MAX_PROFILE_CACHE_ENTRIES);
      await AsyncStorage.setItem(
        PLAYER_PROFILE_CACHE_KEY,
        JSON.stringify(sorted),
      );
    } catch {
      // best-effort cache persistence
    }
  }, 1500);
}

function getCachedProfile(
  params: PlayerProfileParams,
): ResolvedPlayerProfile | null {
  const key = buildPlayerCacheKey(params);
  const entry = profileCache.get(key);
  if (!entry) return null;
  if (Date.now() - entry.ts > PLAYER_PROFILE_TTL) {
    profileCache.delete(key);
    return null;
  }
  return entry.data;
}

function setCachedProfile(
  params: PlayerProfileParams,
  profile: ResolvedPlayerProfile,
): void {
  profileCache.set(buildPlayerCacheKey(params), {
    data: profile,
    ts: Date.now(),
  });
  schedulePersist();
}

async function safeFetchJson<T>(
  route: string,
  fallback: T | null = null,
): Promise<T | null> {
  try {
    const response = await apiRequest("GET", route);
    if (!response.ok) return fallback;
    return (await response.json()) as T;
  } catch {
    return fallback;
  }
}

function unwrapEnvelope<T>(value: any): T | null {
  if (!value) return null;
  if (value.ok !== undefined && value.data !== undefined)
    return value.data as T;
  if (value.error && value.ok === undefined) return null;
  return value as T;
}

function buildSeedPayload(
  params: PlayerProfileParams,
): Record<string, unknown> {
  return {
    id: ensureText(params.playerId),
    espnId: ensureText(params.playerId),
    name: ensureText(params.name),
    currentClub: ensureText(params.team),
    team: ensureText(params.team),
    teamName: ensureText(params.team),
    league: ensureText(params.league),
    photo: params.photo || null,
    theSportsDbPhoto: params.theSportsDbPhoto || null,
    marketValue: params.marketValue || null,
    age: toNumber(params.age),
    height: ensureText(params.height) || null,
    weight: ensureText(params.weight) || null,
    position: ensureText(params.position) || null,
    nationality: ensureText(params.nationality) || null,
    source: "seed",
  };
}

function choosePhotoCandidate(
  candidates: Array<{ url: string | null | undefined; source: string }>,
): { url: string | null; source: string | null } {
  const best = chooseBestPhotoCandidate("player-profile-photo", candidates);
  return { url: best?.url ?? null, source: best?.source ?? null };
}

function chooseBestText(
  values: unknown[],
  fallback: string | null = null,
): string | null {
  for (const value of values) {
    if (isMeaningfulText(value)) return ensureText(value);
  }
  return fallback;
}

function chooseBestNumber(values: unknown[]): number | null {
  for (const value of values) {
    const parsed = toNumber(value);
    if (parsed != null && Number.isFinite(parsed)) return parsed;
  }
  return null;
}

function mergeSeasonStats(
  ...values: any[]
): Record<string, number | null> | null {
  const keys = [
    "appearances",
    "goals",
    "assists",
    "minutes",
    "starts",
    "rating",
    "cleanSheets",
    "saves",
  ];
  const output: Record<string, number | null> = {};
  let hits = 0;
  for (const key of keys) {
    const value = chooseBestNumber(values.map((item) => item?.[key]));
    output[key] = value;
    if (value != null) hits += 1;
  }
  return hits > 0 ? output : null;
}

function mergeFormerClubs(...sources: any[]): any[] {
  const deduped = new Map<string, any>();
  for (const source of sources) {
    const rows = Array.isArray(source) ? source : [];
    for (const row of rows) {
      const name = chooseBestText([row?.teamName, row?.name], "");
      const date = ensureText(row?.date);
      const action = ensureText(row?.action || row?.role);
      if (!name) continue;
      const key = `${normalizeLookupText(name)}|${date}|${action}`;
      if (!deduped.has(key)) deduped.set(key, row);
    }
  }
  return [...deduped.values()];
}

function logResolverResult(profile: ResolvedPlayerProfile): void {
  if (!__DEV__) return;
  console.log("[player-resolver] final", {
    id: profile.id,
    name: profile.name,
    team: profile.currentClub,
    photo: profile.resolver?.finalPhotoUrl,
    marketValue: profile.marketValue,
    valueSource: profile.resolver?.finalValueSource,
    missingFields: profile.resolver?.missingFields,
    cache: profile.resolver?.cache,
    profileAttempts: profile.resolver?.profile?.attempts,
    valueAttempts: profile.resolver?.value?.attempts,
  });
}

function buildMissingFields(profile: ResolvedPlayerProfile): string[] {
  const checks: Array<[string, unknown]> = [
    ["photo", profile.photo || profile.theSportsDbPhoto || profile.image?.uri],
    ["fullName", profile.name],
    ["number", profile.jerseyNumber ?? profile.shirtNumber],
    ["age", profile.age],
    ["nationality", profile.nationality],
    ["position", profile.position],
    ["height", profile.height],
    ["weight", profile.weight],
    ["preferredFoot", profile.foot],
    ["birthDate", profile.birthDate],
    ["marketValue", profile.marketValue],
    ["team", profile.currentClub],
    ["league", profile.league],
    ["seasonStats", profile.seasonStats],
  ];
  return checks
    .filter(([, value]) => {
      if (typeof value === "string") return !isMeaningfulText(value);
      if (typeof value === "number") return !Number.isFinite(value);
      return !value;
    })
    .map(([field]) => field);
}

function createResolvedProfile(input: {
  params: PlayerProfileParams;
  cached: ResolvedPlayerProfile | null;
  profileData: any;
  profileMeta: ResolverMeta;
  valueData: any;
  valueMeta: ResolverMeta;
}): ResolvedPlayerProfile {
  const seed = buildSeedPayload(input.params);
  const enriched = enrichPlayerProfilePayload(input.profileData, input.params);
  const cached = input.cached;
  const marketValue = normalizePlayerMarketValue(
    input.valueData,
    input.params.playerId,
  );
  const upstreamPhotoCandidates = Array.isArray(enriched?.photoCandidates)
    ? enriched.photoCandidates
    : Array.isArray(cached?.photoCandidates)
      ? cached.photoCandidates
      : [];
  const photoChoice = choosePhotoCandidate([
    ...upstreamPhotoCandidates,
    {
      url: enriched?.photo,
      source: enriched?.photoSource || "profile-photo",
    },
    {
      url: enriched?.image?.uri,
      source: enriched?.image?.source || "profile-image",
    },
    { url: enriched?.theSportsDbPhoto, source: "profile-tsdb" },
    {
      url: cached?.photo,
      source: cached?.photoSource || "cached-photo",
    },
    { url: cached?.theSportsDbPhoto, source: "cached-tsdb" },
    {
      url: getCachedPhoto(
        {
          id: input.params.playerId,
          name: input.params.name,
          team: input.params.team,
          league: input.params.league,
          sport: input.params.sport,
        },
        "player-profile-photo",
      ),
      source: "photo-cache",
    },
    { url: input.params.photo, source: "seed-photo" },
    { url: input.params.theSportsDbPhoto, source: "seed-tsdb" },
  ]);

  const seasonStats = mergeSeasonStats(
    enriched?.seasonStats,
    input.profileData?.seasonStats,
    cached?.seasonStats,
  );

  const resolved: ResolvedPlayerProfile = {
    id:
      chooseBestText(
        [enriched?.id, enriched?.espnId, input.params.playerId],
        input.params.playerId,
      ) || input.params.playerId,
    espnId: chooseBestText([enriched?.espnId, input.params.playerId]),
    name:
      chooseBestText([enriched?.name, cached?.name, seed.name], "Player") ||
      "Player",
    firstName:
      chooseBestText(
        [enriched?.firstName, cached?.firstName],
        undefined as never,
      ) || undefined,
    lastName:
      chooseBestText(
        [enriched?.lastName, cached?.lastName],
        undefined as never,
      ) || undefined,
    age: chooseBestNumber([enriched?.age, cached?.age, seed.age]),
    birthDate: chooseBestText([enriched?.birthDate, cached?.birthDate]),
    nationality: chooseBestText([
      enriched?.nationality,
      cached?.nationality,
      seed.nationality,
    ]),
    position: chooseBestText([
      enriched?.position,
      cached?.position,
      seed.position,
    ]),
    positionAbbr: chooseBestText([
      enriched?.positionAbbr,
      cached?.positionAbbr,
    ]),
    height: chooseBestText([enriched?.height, cached?.height, seed.height]),
    weight: chooseBestText([enriched?.weight, cached?.weight, seed.weight]),
    shirtNumber: chooseBestNumber([
      enriched?.shirtNumber,
      enriched?.jerseyNumber,
      cached?.shirtNumber,
      cached?.jerseyNumber,
    ]),
    jerseyNumber: chooseBestText([
      enriched?.jerseyNumber,
      enriched?.shirtNumber,
      cached?.jerseyNumber,
      cached?.shirtNumber,
    ]),
    foot: normalizeFoot(
      enriched?.foot ?? enriched?.preferredFoot ?? cached?.foot,
    ),
    currentClub: chooseBestText([
      enriched?.currentClub,
      enriched?.teamName,
      cached?.currentClub,
      seed.currentClub,
    ]),
    currentClubLogo: chooseBestText([
      enriched?.currentClubLogo,
      cached?.currentClubLogo,
    ]),
    teamId: chooseBestText([enriched?.teamId, cached?.teamId]),
    teamName: chooseBestText([
      enriched?.teamName,
      enriched?.currentClub,
      cached?.teamName,
      seed.teamName,
    ]),
    league: chooseBestText([
      input.params.league,
      enriched?.league,
      cached?.league,
    ]),
    marketValue: chooseBestText([
      marketValue?.displayValue,
      enriched?.marketValue,
      cached?.marketValue,
      seed.marketValue,
    ]),
    marketValueNumeric: chooseBestNumber([
      marketValue?.numericValue,
      enriched?.marketValueNumeric,
      cached?.marketValueNumeric,
      parseMarketValueNumeric(seed.marketValue),
    ]),
    marketValueHistory:
      Array.isArray(marketValue?.history) && marketValue.history.length
        ? marketValue.history
        : cached?.marketValueHistory || [],
    valueSource: chooseBestText([
      marketValue?.source,
      enriched?.valueMethod,
      cached?.valueSource,
    ]),
    valueMethod: chooseBestText([
      enriched?.valueMethod,
      marketValue?.source,
      cached?.valueMethod,
    ]),
    isRealValue:
      typeof enriched?.isRealValue === "boolean"
        ? enriched.isRealValue
        : Boolean(marketValue?.numericValue ?? cached?.isRealValue),
    photo: photoChoice.url,
    photoSource: photoChoice.source,
    photoCandidates:
      upstreamPhotoCandidates.length > 0
        ? upstreamPhotoCandidates
        : photoChoice.url && photoChoice.source
          ? [{ url: photoChoice.url, source: photoChoice.source }]
          : [],
    theSportsDbPhoto: chooseBestText([
      enriched?.theSportsDbPhoto,
      cached?.theSportsDbPhoto,
      input.params.theSportsDbPhoto,
    ]),
    image: photoChoice.url
      ? {
          uri: photoChoice.url,
          source: photoChoice.source || "resolver",
          confidence: 0.9,
        }
      : null,
    seasonStats,
    formerClubs: mergeFormerClubs(
      enriched?.formerClubs,
      input.profileData?.formerClubs,
      cached?.formerClubs,
    ),
    strengths: Array.isArray(enriched?.strengths)
      ? enriched.strengths
      : Array.isArray(cached?.strengths)
        ? cached.strengths
        : [],
    weaknesses: Array.isArray(enriched?.weaknesses)
      ? enriched.weaknesses
      : Array.isArray(cached?.weaknesses)
        ? cached.weaknesses
        : [],
    analysis: chooseBestText([enriched?.analysis, cached?.analysis]),
    recentForm: enriched?.recentForm ?? cached?.recentForm ?? null,
    profileMeta: enriched?.profileMeta ?? cached?.profileMeta ?? null,
    contractUntil: chooseBestText([
      enriched?.contractUntil,
      cached?.contractUntil,
    ]),
    source: chooseBestText([
      input.profileMeta.selectedSource,
      enriched?.source,
      cached?.source,
    ]),
    updatedAt: chooseBestText([
      enriched?.updatedAt,
      cached?.updatedAt,
      new Date().toISOString(),
    ]),
    offlineData: Boolean(enriched?.offlineData ?? cached?.offlineData),
    resolver: {
      cache: cached ? "hit" : "miss",
      profile: input.profileMeta,
      value: input.valueMeta,
      missingFields: [],
      finalPhotoUrl: photoChoice.url,
      finalValueSource: chooseBestText([
        marketValue?.source,
        enriched?.valueMethod,
        cached?.valueSource,
      ]),
    },
  };

  resolved.resolver!.missingFields = buildMissingFields(resolved);
  return resolved;
}

export async function resolvePlayerProfile(
  params: PlayerProfileParams,
): Promise<ResolvedPlayerProfile | null> {
  await hydrateProfileCache();
  const cacheKey = buildPlayerCacheKey(params);
  const cached = getCachedProfile(params);

  if (cached) {
    if (__DEV__) {
      console.log("[player-resolver] cache hit", {
        playerId: params.playerId,
        name: params.name,
        team: params.team,
      });
    }
    return cached;
  }

  const existingInflight = inflightProfiles.get(cacheKey);
  if (existingInflight) return existingInflight;

  const task = (async () => {
    const query = new URLSearchParams();
    if (params.name) query.set("name", params.name);
    if (params.team) query.set("team", params.team);
    if (params.league) query.set("league", params.league);
    if (params.sport) query.set("sport", params.sport);

    const profileContextRoute = `/api/sports/player/${encodeURIComponent(params.playerId)}${query.size ? `?${query.toString()}` : ""}`;
    const profileBasicRoute = `/api/sports/player/${encodeURIComponent(params.playerId)}`;

    const profileResolved = await resolveFromSources<any>({
      strategy: "player-profile",
      sources: [
        {
          source: "profile-context",
          load: async () =>
            unwrapEnvelope(await safeFetchJson<any>(profileContextRoute)),
        },
        {
          source: "profile-basic",
          load: async () =>
            unwrapEnvelope(await safeFetchJson<any>(profileBasicRoute)),
        },
      ].filter((entry, index) => index === 0 || query.size > 0),
      isUsable: (value) => Boolean(value?.id || value?.name),
      score: (value) =>
        scoreByFilledFields(value, [
          "name",
          "photo",
          "theSportsDbPhoto",
          "nationality",
          "position",
          "seasonStats",
          "marketValue",
          "formerClubs",
        ]),
      stopOnFirstUsable: true,
      stopOnScore: 0.7,
      debug: true,
    });

    const baseProfile = profileResolved.data || buildSeedPayload(params);
    const hasValue = Boolean(
      baseProfile?.marketValue || baseProfile?.marketValueNumeric,
    );
    const valueSource = chooseBestText([
      baseProfile?.valueSource,
      baseProfile?.valueMethod,
      baseProfile?.resolver?.selected?.value,
      baseProfile?.source,
    ]);
    const valueMeta: ResolverMeta = {
      strategy: "player-value",
      selectedSource: valueSource || undefined,
      selectedScore: hasValue ? 1 : 0,
      attempts: [
        {
          source: valueSource || "profile",
          ok: hasValue,
          score: hasValue ? 1 : 0,
          durationMs: 0,
          reason: hasValue ? undefined : "empty",
        },
      ],
    };
    const resolved = createResolvedProfile({
      params,
      cached,
      profileData: baseProfile,
      profileMeta: profileResolved.meta,
      valueData: {
        playerId: baseProfile?.id ?? params.playerId,
        playerName: baseProfile?.name ?? params.name,
        displayValue: baseProfile?.marketValue ?? null,
        numericValue: baseProfile?.marketValueNumeric ?? null,
        history: baseProfile?.marketValueHistory ?? null,
        source: valueSource || baseProfile?.source || "profile",
      },
      valueMeta,
    });

    if (resolved.photo || resolved.theSportsDbPhoto) {
      seedPlayerPhotos([
        {
          id: resolved.id,
          name: resolved.name,
          team: resolved.currentClub || resolved.teamName || params.team,
          league: resolved.league || params.league,
          sport: params.sport,
          photo: resolved.photo || null,
          photoSource: resolved.photoSource || null,
          theSportsDbPhoto: resolved.theSportsDbPhoto || null,
          photoCandidates: resolved.photoCandidates || [],
        },
      ]);
    }

    setCachedProfile(params, resolved);
    logResolverResult(resolved);
    return resolved;
  })().finally(() => {
    inflightProfiles.delete(cacheKey);
  });

  inflightProfiles.set(cacheKey, task);
  return task;
}

export function getPlayerResolverCacheSnapshot(
  params: PlayerProfileParams,
): ResolvedPlayerProfile | null {
  return getCachedProfile(params);
}

export async function prefetchPlayerProfile(
  params: PlayerProfileParams,
): Promise<void> {
  await resolvePlayerProfile(params);
}
