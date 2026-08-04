import AsyncStorage from "@react-native-async-storage/async-storage";

import type { HealCategory, HealLevel, HealLogEntry } from "./types";

const LOG_KEY = "nexora:self-heal:logs";
const MAX_LOGS = 300;

let memLogs: HealLogEntry[] = [];
let hydrated = false;

function makeId() {
  return `heal_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

function append(entry: HealLogEntry) {
  memLogs.push(entry);
  if (memLogs.length > MAX_LOGS) {
    memLogs = memLogs.slice(memLogs.length - MAX_LOGS);
  }
}

export async function hydrateSelfHealingLogs() {
  if (hydrated) return;
  hydrated = true;
  try {
    const raw = await AsyncStorage.getItem(LOG_KEY);
    if (!raw) return;
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) {
      memLogs = parsed.slice(-MAX_LOGS);
    }
  } catch {
    // ignore corrupted state
  }
}

async function persist() {
  try {
    await AsyncStorage.setItem(LOG_KEY, JSON.stringify(memLogs.slice(-MAX_LOGS)));
  } catch {
    // no-op
  }
}

export async function logSelfHealing(
  level: HealLevel,
  category: HealCategory,
  message: string,
  context?: Record<string, unknown>,
) {
  const entry: HealLogEntry = {
    id: makeId(),
    ts: Date.now(),
    level,
    category,
    message,
    context,
  };
  append(entry);
  if (__DEV__) {
    const payload = context ? { ...context } : undefined;
    // eslint-disable-next-line no-console
    console[level === "error" ? "error" : level === "warn" ? "warn" : "info"](
      `[self-healing:${category}] ${message}`,
      payload,
    );
  }
  void persist();
}

export function getSelfHealingLogs(limit = 100): HealLogEntry[] {
  return memLogs.slice(Math.max(0, memLogs.length - limit));
}

export async function clearSelfHealingLogs() {
  memLogs = [];
  try {
    await AsyncStorage.removeItem(LOG_KEY);
  } catch {
    // ignore
  }
}
