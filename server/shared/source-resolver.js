import { readFileSync } from "node:fs";

const sourcePolicy = Object.freeze(
  JSON.parse(
    readFileSync(
      new URL("../../shared/sports-source-policy.json", import.meta.url),
      "utf8",
    ),
  ),
);

function normalizeText(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/_/g, "-");
}

function normalizeSourceList(values) {
  return Array.isArray(values)
    ? values.map((value) => normalizePolicySource(value)).filter(Boolean)
    : [];
}

function hasMeaningfulValue(value) {
  if (value == null) return false;
  if (typeof value === "number") return Number.isFinite(value);
  if (Array.isArray(value)) return value.length > 0;
  if (typeof value === "object") return Object.keys(value).length > 0;
  return Boolean(String(value).trim());
}

function getPriorityRank(order, source) {
  const normalizedSource = normalizePolicySource(source);
  const normalizedOrder = normalizeSourceList(order);
  const index = normalizedOrder.indexOf(normalizedSource);
  return index === -1 ? normalizedOrder.length + 100 : index;
}

function getFieldOrder(domain, field) {
  return sourcePolicy.fieldOwnership?.[domain]?.[field] || [];
}

function decodeProxiedUrl(url) {
  const raw = String(url || "").trim();
  if (!raw) return "";
  try {
    const parsed = new URL(raw, "https://nexora.local");
    const nested = parsed.searchParams.get("url");
    if (nested && /^https?:\/\//i.test(nested)) return nested;
  } catch {
    return raw;
  }
  return raw;
}

export function getSourcePolicy() {
  return sourcePolicy;
}

export function normalizePolicySource(source) {
  const normalized = normalizeText(source);
  if (!normalized) return "";
  return sourcePolicy.aliases?.[normalized] || normalized;
}

export function normalizePersonLookupKey(value) {
  return String(value || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9 ]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function inferPhotoSource(url, explicitSource = "") {
  const explicit = normalizePolicySource(explicitSource);
  if (explicit) return explicit;

  const resolvedUrl = decodeProxiedUrl(url);
  if (!resolvedUrl) return "server";
  if (/api\.sofascore\./i.test(resolvedUrl)) return "sofascore";
  if (/a\.espncdn\.com\/i\/headshots\//i.test(resolvedUrl)) return "espn";
  if (/thesportsdb\.com/i.test(resolvedUrl)) return "thesportsdb";
  if (/transfermarkt/i.test(resolvedUrl)) return "transfermarkt";
  return "server";
}

export function getPriorityOrder(priorityKey) {
  return normalizeSourceList(sourcePolicy.priorityOrder?.[priorityKey]);
}

export function getSourcePriority(priorityKey, source) {
  return getPriorityRank(getPriorityOrder(priorityKey), source);
}

export function shouldReplacePriorityValue(
  priorityKey,
  currentSource,
  incomingSource,
) {
  if (!incomingSource) return false;
  if (!currentSource) return true;
  return (
    getSourcePriority(priorityKey, incomingSource) <
    getSourcePriority(priorityKey, currentSource)
  );
}

export function sortPriorityCandidates(priorityKey, candidates = []) {
  return [...candidates].sort(
    (a, b) =>
      getSourcePriority(priorityKey, a?.source) -
      getSourcePriority(priorityKey, b?.source),
  );
}

export function selectPriorityCandidate(
  priorityKey,
  candidates = [],
  options = {},
) {
  const isMeaningful = options.isMeaningful || hasMeaningfulValue;
  let best = null;

  for (const candidate of candidates) {
    if (!candidate || !isMeaningful(candidate.value)) continue;
    const source = normalizePolicySource(candidate.source);
    const rank = getSourcePriority(priorityKey, source);
    if (!best || rank < best.rank) {
      best = { source, value: candidate.value, rank };
    }
  }

  return {
    source: best?.source || null,
    value: best?.value ?? null,
    rank: best?.rank ?? Number.POSITIVE_INFINITY,
  };
}

export function shouldReplaceField(
  domain,
  field,
  currentSource,
  incomingSource,
) {
  if (!incomingSource) return false;
  if (!currentSource) return true;
  const order = getFieldOrder(domain, field);
  return (
    getPriorityRank(order, incomingSource) <
    getPriorityRank(order, currentSource)
  );
}

export function selectFieldCandidate(
  domain,
  field,
  candidates = [],
  options = {},
) {
  const order = getFieldOrder(domain, field);
  const isMeaningful = options.isMeaningful || hasMeaningfulValue;
  let best = null;

  for (const candidate of candidates) {
    if (!candidate || !isMeaningful(candidate.value)) continue;
    const source = normalizePolicySource(candidate.source);
    const rank = getPriorityRank(order, source);
    if (!best || rank < best.rank) {
      best = { source, value: candidate.value, rank };
    }
  }

  return {
    source: best?.source || null,
    value: best?.value ?? null,
    rank: best?.rank ?? Number.POSITIVE_INFINITY,
  };
}
