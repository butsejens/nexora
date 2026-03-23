import AsyncStorage from "@react-native-async-storage/async-storage";
import { Image } from "react-native";
import * as FileSystem from "expo-file-system";
import type { QueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/query-client";

type Nullable<T> = T | null | undefined;

export type PlayerSeed = {
  id?: string;
  name?: string;
  team?: string;
  league?: string;
  sport?: string;
  gender?: string;
  nationality?: string;
  birthDate?: string;
  age?: number;
  photo?: string | null;
  theSportsDbPhoto?: string | null;
};

type PlayerImageEntry = {
  key: string;
  playerId?: string;
  name?: string;
  team?: string;
  league?: string;
  photoUrl: string | null;
  localUri: string | null;
  source: "espn" | "internal" | "gemini" | "fallback" | "none";
  confidence: number;
  updatedAt: number;
  expiresAt: number;
};

type PlayerProfileEntry = {
  key: string;
  data: any;
  updatedAt: number;
  expiresAt: number;
};

const IMAGE_CACHE_KEY = "nexora_player_image_cache_v2";
const PROFILE_CACHE_KEY = "nexora_player_profile_cache_v2";
const PRELOAD_META_KEY = "nexora_player_preload_meta_v1";
const CACHE_TTL_MS = 24 * 60 * 60 * 1000;
const MAX_IMAGE_ENTRIES = 4500;
const MAX_PROFILE_ENTRIES = 2500;
const PLAYER_IMAGE_DIR = `${FileSystem.documentDirectory || FileSystem.cacheDirectory || ""}player-images/`;
const PRELOAD_LEAGUES = ["bel.1", "eng.1", "esp.1", "ger.1", "ita.1", "fra.1", "ned.1", "uefa.champions"];

const imageCache = new Map<string, PlayerImageEntry>();
const profileCache = new Map<string, PlayerProfileEntry>();
let loadedFromDisk = false;
let persistTimer: ReturnType<typeof setTimeout> | null = null;
let warmupPromise: Promise<void> | null = null;
let globalQueryClient: QueryClient | null = null;

function normalizeText(value: Nullable<string>): string {
  return String(value || "").trim();
}

function normalizeName(value: Nullable<string>): string {
  return normalizeText(value)
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9 ]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function hashString(input: string): string {
  let h = 2166136261;
  for (let i = 0; i < input.length; i += 1) {
    h ^= input.charCodeAt(i);
    h += (h << 1) + (h << 4) + (h << 7) + (h << 8) + (h << 24);
  }
  return Math.abs(h >>> 0).toString(36);
}

function scoreNameSimilarity(a: string, b: string): number {
  if (!a || !b) return 0;
  if (a === b) return 1;
  const aParts = a.split(" ").filter(Boolean);
  const bParts = b.split(" ").filter(Boolean);
  const aSet = new Set(aParts);
  const bSet = new Set(bParts);
  let overlap = 0;
  for (const token of aSet) if (bSet.has(token)) overlap += 1;
  const union = new Set([...aSet, ...bSet]).size || 1;
  const jaccard = overlap / union;
  const starts = aParts[0] && bParts[0] && (aParts[0] === bParts[0] ? 0.15 : 0);
  return Math.min(1, jaccard + starts);
}

export function makePlayerCacheKey(player: PlayerSeed): string {
  const id = normalizeText(player.id);
  if (/^\d+$/.test(id)) return `id:${id}`;
  const name = normalizeName(player.name);
  const team = normalizeName(player.team);
  const league = normalizeName(player.league);
  const sport = normalizeName(player.sport || "soccer");
  const gender = normalizeName(player.gender);
  return `name:${name}|team:${team}|league:${league}|sport:${sport}|gender:${gender}`;
}

function now(): number {
  return Date.now();
}

function isExpired(ts: number): boolean {
  return ts <= now();
}

function isValidHttpUrl(value: Nullable<string>): boolean {
  if (!value) return false;
  return /^https?:\/\//i.test(String(value));
}

function isEspnPhoto(url: string): boolean {
  return /a\.espncdn\.com\/i\/headshots\//i.test(url);
}

function classifySource(url: string): PlayerImageEntry["source"] {
  if (isEspnPhoto(url)) return "espn";
  if (/wikipedia|wikimedia/i.test(url)) return "gemini";
  if (/ui-avatars\.com/i.test(url)) return "fallback";
  return "internal";
}

function scoreCandidate(url: string, player: PlayerSeed, meta?: { candidateName?: string; candidateTeam?: string }): number {
  let score = 0.15;
  if (isEspnPhoto(url)) score += 0.2;
  if (/thesportsdb|transfermarkt|wikimedia|wikipedia/i.test(url)) score += 0.18;

  const playerName = normalizeName(player.name);
  const candidateName = normalizeName(meta?.candidateName || player.name);
  const playerTeam = normalizeName(player.team);
  const candidateTeam = normalizeName(meta?.candidateTeam || player.team);

  const nameSimilarity = scoreNameSimilarity(playerName, candidateName);
  score += nameSimilarity * 0.45;

  if (playerTeam && candidateTeam) {
    const teamSimilarity = scoreNameSimilarity(playerTeam, candidateTeam);
    score += teamSimilarity * 0.14;
  }

  if (normalizeText(player.gender) && normalizeText(player.gender) === normalizeText(meta?.candidateTeam)) {
    score += 0.02;
  }

  return Math.max(0, Math.min(1, score));
}

async function ensureImageDirectory(): Promise<void> {
  if (!PLAYER_IMAGE_DIR) return;
  try {
    await FileSystem.makeDirectoryAsync(PLAYER_IMAGE_DIR, { intermediates: true });
  } catch {
    // no-op
  }
}

async function cacheRemoteImageLocally(cacheKey: string, photoUrl: string): Promise<string | null> {
  if (!PLAYER_IMAGE_DIR || !isValidHttpUrl(photoUrl)) return null;
  await ensureImageDirectory();

  const extMatch = String(photoUrl).match(/\.(png|jpg|jpeg|webp)(\?|$)/i);
  const ext = (extMatch?.[1] || "jpg").toLowerCase();
  const fileName = `${hashString(`${cacheKey}:${photoUrl}`)}.${ext}`;
  const destination = `${PLAYER_IMAGE_DIR}${fileName}`;

  try {
    const existing = await FileSystem.getInfoAsync(destination);
    if (existing.exists) return destination;

    const result = await FileSystem.downloadAsync(photoUrl, destination);
    if (result.status >= 200 && result.status < 300) return result.uri;
  } catch {
    // ignore
  }

  return null;
}

async function prefetchRuntimeImage(url: string): Promise<void> {
  if (!isValidHttpUrl(url)) return;
  try {
    await Image.prefetch(url);
  } catch {
    // no-op
  }
}

function trimCacheMap<T extends { updatedAt: number }>(map: Map<string, T>, max: number): void {
  if (map.size <= max) return;
  const sorted = [...map.entries()].sort((a, b) => b[1].updatedAt - a[1].updatedAt);
  map.clear();
  for (const [k, v] of sorted.slice(0, max)) map.set(k, v);
}

function schedulePersist(): void {
  if (persistTimer) clearTimeout(persistTimer);
  persistTimer = setTimeout(async () => {
    persistTimer = null;
    try {
      trimCacheMap(imageCache, MAX_IMAGE_ENTRIES);
      trimCacheMap(profileCache, MAX_PROFILE_ENTRIES);
      await AsyncStorage.multiSet([
        [IMAGE_CACHE_KEY, JSON.stringify([...imageCache.entries()])],
        [PROFILE_CACHE_KEY, JSON.stringify([...profileCache.entries()])],
        [PRELOAD_META_KEY, JSON.stringify({ updatedAt: now() })],
      ]);
    } catch {
      // ignore persistence errors
    }
  }, 300);
}

export async function hydratePlayerImageCaches(): Promise<void> {
  if (loadedFromDisk) return;
  loadedFromDisk = true;
  try {
    const [imagesRaw, profilesRaw] = await AsyncStorage.multiGet([IMAGE_CACHE_KEY, PROFILE_CACHE_KEY]).then((pairs) => pairs.map(([, v]) => v));

    if (imagesRaw) {
      const parsed = JSON.parse(imagesRaw) as Array<[string, PlayerImageEntry]>;
      for (const [k, v] of parsed || []) {
        if (!k || !v || isExpired(Number(v.expiresAt || 0))) continue;
        imageCache.set(k, v);
      }
    }
    if (profilesRaw) {
      const parsed = JSON.parse(profilesRaw) as Array<[string, PlayerProfileEntry]>;
      for (const [k, v] of parsed || []) {
        if (!k || !v || isExpired(Number(v.expiresAt || 0))) continue;
        profileCache.set(k, v);
      }
    }
  } catch {
    // ignore hydration errors
  }
}

export function getCachedPlayerImage(player: PlayerSeed): string | null {
  const key = makePlayerCacheKey(player);
  const hit = imageCache.get(key);
  if (!hit || isExpired(hit.expiresAt)) return null;
  return hit.localUri || hit.photoUrl || null;
}

export function getCachedPlayerProfile(player: PlayerSeed): any | null {
  const key = makePlayerCacheKey(player);
  const hit = profileCache.get(key);
  if (!hit || isExpired(hit.expiresAt)) return null;
  return hit.data;
}

function mergeProfileIntoCache(player: PlayerSeed, profileData: any): void {
  const key = makePlayerCacheKey(player);
  profileCache.set(key, {
    key,
    data: profileData,
    updatedAt: now(),
    expiresAt: now() + CACHE_TTL_MS,
  });
  if (globalQueryClient) {
    globalQueryClient.setQueryData(["player-profile", player.id, player.name, player.team, player.league], profileData);
  }
  schedulePersist();
}

function mergeImageIntoCache(player: PlayerSeed, image: { photoUrl: string | null; localUri: string | null; confidence: number; source: PlayerImageEntry["source"] }): void {
  const key = makePlayerCacheKey(player);
  imageCache.set(key, {
    key,
    playerId: normalizeText(player.id) || undefined,
    name: normalizeText(player.name) || undefined,
    team: normalizeText(player.team) || undefined,
    league: normalizeText(player.league) || undefined,
    photoUrl: image.photoUrl,
    localUri: image.localUri,
    source: image.source,
    confidence: image.confidence,
    updatedAt: now(),
    expiresAt: now() + CACHE_TTL_MS,
  });
  schedulePersist();
}

async function getPlayerProfileFromApi(player: PlayerSeed): Promise<any | null> {
  const playerId = encodeURIComponent(normalizeText(player.id));
  const name = encodeURIComponent(normalizeText(player.name));
  const team = encodeURIComponent(normalizeText(player.team));
  const league = encodeURIComponent(normalizeText(player.league || "eng.1"));
  try {
    const response = await Promise.race([
      apiRequest("GET", `/api/sports/player/${playerId}?name=${name}&team=${team}&league=${league}`),
      new Promise<Response>((_, reject) => setTimeout(() => reject(new Error("player profile timeout")), 7000)),
    ]);
    const json = await response.json();
    if (!json || json?.error) return null;
    return json;
  } catch {
    return null;
  }
}

function collectCandidates(player: PlayerSeed, profile: any | null): Array<{ url: string; source: PlayerImageEntry["source"]; confidence: number }> {
  const candidates: Array<{ url: string; source: PlayerImageEntry["source"]; confidence: number }> = [];

  const direct = [player.photo, player.theSportsDbPhoto, profile?.photo, profile?.theSportsDbPhoto]
    .map((x) => normalizeText(x || ""))
    .filter((x) => isValidHttpUrl(x));

  for (const url of direct) {
    const source = classifySource(url);
    const confidence = scoreCandidate(url, player, {
      candidateName: profile?.name || player.name,
      candidateTeam: profile?.currentClub || player.team,
    });
    candidates.push({ url, source, confidence });
  }

  // Deterministic fallback image; never wrong identity, only initials avatar.
  const fallbackName = normalizeText(profile?.name || player.name || "Player");
  if (fallbackName) {
    const fallbackUrl = `https://ui-avatars.com/api/?name=${encodeURIComponent(fallbackName)}&size=256&background=1a1a2e&color=e0e0e0&bold=true&format=png`;
    candidates.push({ url: fallbackUrl, source: "fallback", confidence: 0.4 });
  }

  return candidates;
}

function chooseBestCandidate(player: PlayerSeed, candidates: Array<{ url: string; source: PlayerImageEntry["source"]; confidence: number }>): { url: string | null; source: PlayerImageEntry["source"]; confidence: number } {
  if (!candidates.length) return { url: null, source: "none", confidence: 0 };

  const name = normalizeName(player.name);
  const hasIdentityContext = Boolean(name) && (Boolean(normalizeText(player.id)) || Boolean(normalizeName(player.team)));
  const sorted = [...candidates].sort((a, b) => b.confidence - a.confidence);
  const winner = sorted[0];

  if (!hasIdentityContext && winner.source !== "fallback") {
    return { url: null, source: "none", confidence: 0 };
  }

  if (winner.source !== "fallback" && winner.confidence < 0.58) {
    return { url: null, source: "none", confidence: winner.confidence };
  }

  return { url: winner.url, source: winner.source, confidence: winner.confidence };
}

export async function getPlayerImage(player: PlayerSeed, options?: { allowNetwork?: boolean; preloadProfile?: boolean }): Promise<string | null> {
  await hydratePlayerImageCaches();
  const key = makePlayerCacheKey(player);
  const cached = imageCache.get(key);
  if (cached && !isExpired(cached.expiresAt) && (cached.localUri || cached.photoUrl)) {
    return cached.localUri || cached.photoUrl || null;
  }

  let profile = getCachedPlayerProfile(player);
  const allowNetwork = options?.allowNetwork !== false;

  if (!profile && allowNetwork) {
    profile = await getPlayerProfileFromApi(player);
    if (profile) mergeProfileIntoCache(player, profile);
  }

  const candidates = collectCandidates(player, profile);
  const winner = chooseBestCandidate(player, candidates);
  if (!winner.url) {
    mergeImageIntoCache(player, { photoUrl: null, localUri: null, confidence: 0, source: "none" });
    return null;
  }

  await prefetchRuntimeImage(winner.url);
  const localUri = await cacheRemoteImageLocally(key, winner.url);
  mergeImageIntoCache(player, {
    photoUrl: winner.url,
    localUri,
    confidence: winner.confidence,
    source: winner.source,
  });

  if (options?.preloadProfile && profile && globalQueryClient) {
    globalQueryClient.setQueryData(["player-profile", player.id, player.name, player.team, player.league], profile);
  }

  return localUri || winner.url;
}

function dedupePlayers(players: PlayerSeed[]): PlayerSeed[] {
  const map = new Map<string, PlayerSeed>();
  for (const player of players) {
    const key = makePlayerCacheKey(player);
    if (!map.has(key)) map.set(key, player);
  }
  return [...map.values()];
}

async function runBatches<T>(items: T[], concurrency: number, worker: (item: T, index: number) => Promise<void>): Promise<void> {
  const count = Math.max(1, Math.min(concurrency, 12));
  let cursor = 0;

  async function runOne(): Promise<void> {
    while (cursor < items.length) {
      const index = cursor;
      cursor += 1;
      try {
        await worker(items[index], index);
      } catch {
        // continue with next
      }
    }
  }

  await Promise.all(Array.from({ length: count }, () => runOne()));
}

function mapTeamPlayers(teamData: any, league: string): PlayerSeed[] {
  const teamName = normalizeText(teamData?.name);
  const players = Array.isArray(teamData?.players) ? teamData.players : [];
  return players
    .map((player: any) => ({
      id: normalizeText(player?.id),
      name: normalizeText(player?.name),
      team: teamName,
      league,
      sport: "soccer",
      nationality: normalizeText(player?.nationality),
      age: Number(player?.age || 0) || undefined,
      photo: player?.photo || null,
      theSportsDbPhoto: player?.theSportsDbPhoto || null,
    }))
    .filter((player: PlayerSeed) => Boolean(player.name));
}

async function fetchTeamDetail(teamId: string, teamName: string, league: string): Promise<any | null> {
  if (!teamId) return null;
  try {
    const tn = encodeURIComponent(teamName || "");
    const response = await Promise.race([
      apiRequest("GET", `/api/sports/team/${encodeURIComponent(teamId)}?sport=soccer&league=${encodeURIComponent(league)}&teamName=${tn}`),
      new Promise<Response>((_, reject) => setTimeout(() => reject(new Error("team detail timeout")), 9000)),
    ]);
    const json = await response.json();
    if (!json || json?.error) return null;
    return json;
  } catch {
    return null;
  }
}

async function fetchStandings(league: string): Promise<any[]> {
  try {
    const response = await Promise.race([
      apiRequest("GET", `/api/sports/standings/${encodeURIComponent(league)}`),
      new Promise<Response>((_, reject) => setTimeout(() => reject(new Error("standings timeout")), 7000)),
    ]);
    const json = await response.json();
    return Array.isArray(json?.teams) ? json.teams : [];
  } catch {
    return [];
  }
}

async function collectStartupPlayers(queryClient: QueryClient): Promise<PlayerSeed[]> {
  const allPlayers: PlayerSeed[] = [];

  for (const league of PRELOAD_LEAGUES) {
    const standings = await fetchStandings(league);
    queryClient.setQueryData(["standings", league], { teams: standings });

    const topTeams = standings.slice(0, 12);
    await runBatches(topTeams, 4, async (team: any) => {
      const teamId = normalizeText(team?.teamId || team?.id);
      const teamName = normalizeText(team?.team || team?.name);
      if (!teamId || !teamName) return;

      const detail = await fetchTeamDetail(teamId, teamName, league);
      if (!detail) return;

      queryClient.setQueryData(["team-detail", teamId, "soccer", league], detail);
      allPlayers.push(...mapTeamPlayers(detail, league));
    });
  }

  return dedupePlayers(allPlayers);
}

export function preloadPlayerProfileInBackground(player: PlayerSeed): void {
  void (async () => {
    await hydratePlayerImageCaches();
    const key = makePlayerCacheKey(player);
    const cachedProfile = profileCache.get(key);
    if (cachedProfile && !isExpired(cachedProfile.expiresAt)) return;

    const profile = await getPlayerProfileFromApi(player);
    if (!profile) return;
    mergeProfileIntoCache(player, profile);
    if (profile?.photo || profile?.theSportsDbPhoto) {
      await getPlayerImage({ ...player, photo: profile.photo, theSportsDbPhoto: profile.theSportsDbPhoto }, { allowNetwork: false });
    }
  })();
}

export function startPlayerImageWarmup(queryClient: QueryClient): Promise<void> {
  globalQueryClient = queryClient;
  if (warmupPromise) return warmupPromise;

  warmupPromise = (async () => {
    await hydratePlayerImageCaches();
    const players = await collectStartupPlayers(queryClient);

    await runBatches(players, 6, async (player) => {
      await getPlayerImage(player, { allowNetwork: true, preloadProfile: true });
    });
  })().catch(() => undefined);

  return warmupPromise;
}

export function getPlayerImageWarmupStatus(): { totalImages: number; totalProfiles: number } {
  return {
    totalImages: imageCache.size,
    totalProfiles: profileCache.size,
  };
}
