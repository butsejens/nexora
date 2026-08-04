import AsyncStorage from "@react-native-async-storage/async-storage";

const KEY = "autonomous:ads:cooldown:v1";

type CooldownState = {
  nextAllowedAt: number;
  failures: number;
};

function now(): number {
  return Date.now();
}

export async function getAdCooldownState(): Promise<CooldownState> {
  try {
    const raw = await AsyncStorage.getItem(KEY);
    if (!raw) return { nextAllowedAt: 0, failures: 0 };
    const parsed = JSON.parse(raw) as CooldownState;
    return {
      nextAllowedAt: Number(parsed?.nextAllowedAt || 0),
      failures: Number(parsed?.failures || 0),
    };
  } catch {
    return { nextAllowedAt: 0, failures: 0 };
  }
}

async function write(state: CooldownState): Promise<void> {
  try {
    await AsyncStorage.setItem(KEY, JSON.stringify(state));
  } catch {
    // best effort
  }
}

export async function isAdAllowed(): Promise<boolean> {
  const state = await getAdCooldownState();
  return state.nextAllowedAt <= now();
}

export async function markAdShown(cooldownMs: number): Promise<void> {
  await write({
    nextAllowedAt: now() + cooldownMs,
    failures: 0,
  });
}

export async function markAdFailure(cooldownMs: number): Promise<void> {
  const current = await getAdCooldownState();
  await write({
    nextAllowedAt: now() + cooldownMs,
    failures: current.failures + 1,
  });
}

