import { Platform } from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";

export type MatchSubscription = {
  id: string;
  espnLeague?: string;
  homeTeam: string;
  awayTeam: string;
};

export type MatchSnapshot = {
  status: string;
  homeScore: number;
  awayScore: number;
  eventHashes: string[];
};

const SUBSCRIPTIONS_KEY = "nexora_match_alert_subscriptions_v1";
const SNAPSHOTS_KEY = "nexora_match_alert_snapshots_v1";

let notificationsInitialized = false;
let notificationsModulePromise: Promise<any | null> | null = null;

async function getNotificationsModule(): Promise<any | null> {
  if (!notificationsModulePromise) {
    notificationsModulePromise = import("expo-notifications")
      .then((module) => module)
      .catch(() => null);
  }
  return notificationsModulePromise;
}

export async function initializeMatchNotifications() {
  if (notificationsInitialized || Platform.OS === "web") return;
  const Notifications = await getNotificationsModule();
  if (!Notifications) return;

  Notifications.setNotificationHandler({
    handleNotification: async () => ({
      shouldShowAlert: true,
      shouldPlaySound: true,
      shouldSetBadge: false,
      shouldShowBanner: true,
      shouldShowList: true,
    }),
  });

  if (Platform.OS === "android") {
    await Notifications.setNotificationChannelAsync("match-events", {
      name: "Wedstrijd updates",
      importance: Notifications.AndroidImportance.HIGH,
      vibrationPattern: [0, 200, 120, 200],
      lightColor: "#00D4FF",
    });
  }

  notificationsInitialized = true;
}

export async function ensureMatchNotificationPermission(): Promise<boolean> {
  if (Platform.OS === "web") return false;
  await initializeMatchNotifications();

  const Notifications = await getNotificationsModule();
  if (!Notifications) return false;

  const current = await Notifications.getPermissionsAsync();
  if (current.granted || current.ios?.status === Notifications.IosAuthorizationStatus.PROVISIONAL) {
    return true;
  }

  const requested = await Notifications.requestPermissionsAsync();
  return Boolean(requested.granted || requested.ios?.status === Notifications.IosAuthorizationStatus.PROVISIONAL);
}

export async function pushMatchNotification(title: string, body: string, data?: Record<string, string>) {
  if (Platform.OS === "web") return;

  const Notifications = await getNotificationsModule();
  if (!Notifications) return;

  const ok = await ensureMatchNotificationPermission();
  if (!ok) return;

  await Notifications.scheduleNotificationAsync({
    content: {
      title,
      body,
      data: data || {},
      sound: true,
    },
    trigger: null,
  });
}

export async function loadMatchSubscriptions(): Promise<MatchSubscription[]> {
  try {
    const raw = await AsyncStorage.getItem(SUBSCRIPTIONS_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export async function saveMatchSubscriptions(subscriptions: MatchSubscription[]) {
  await AsyncStorage.setItem(SUBSCRIPTIONS_KEY, JSON.stringify(subscriptions));
}

export async function loadMatchSnapshots(): Promise<Record<string, MatchSnapshot>> {
  try {
    const raw = await AsyncStorage.getItem(SNAPSHOTS_KEY);
    const parsed = raw ? JSON.parse(raw) : {};
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

export async function saveMatchSnapshots(snapshots: Record<string, MatchSnapshot>) {
  await AsyncStorage.setItem(SNAPSHOTS_KEY, JSON.stringify(snapshots));
}

export function toEventHash(event: any): string {
  const time = String(event?.time || "");
  const type = String(event?.type || "");
  const detail = String(event?.detail || "");
  const team = String(event?.team || "");
  return `${time}|${type}|${detail}|${team}`;
}
