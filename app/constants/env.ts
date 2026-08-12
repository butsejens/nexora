/**
 * CineLog — public runtime configuration.
 *
 * Only `EXPO_PUBLIC_*` values live here; they are inlined into the bundle at
 * build time and are therefore never secret. The TMDB *server* key stays on the
 * CineLog API (`TMDB_API_KEY`) and is never shipped to the client.
 */

function readString(value: string | undefined): string {
  return String(value ?? "").trim();
}

/**
 * Fallback cloud API used when release builds are missing EXPO_PUBLIC_API_BASE.
 * This keeps standalone APK/AAB installs functional outside local dev.
 */
const DEFAULT_PUBLIC_API_BASE = "https://nexora-api-8xxb.onrender.com";

function resolveApiBase(): string {
  return readString(process.env.EXPO_PUBLIC_API_BASE) || DEFAULT_PUBLIC_API_BASE;
}

function resolveApiBases(): string {
  return readString(process.env.EXPO_PUBLIC_API_BASES);
}

const resolvedApiBase = resolveApiBase();
const resolvedApiBases = resolveApiBases();

export const ENV = {
  /** Primary CineLog API base URL (proxies TMDB and holds the server key). */
  apiBase: resolvedApiBase,
  /** Comma-separated fallback API bases tried in order when the primary fails. */
  apiBases: resolvedApiBases,
  /**
   * Optional client-side TMDB key. When present the app talks to TMDB directly,
   * which removes a network hop for standalone mobile builds. Leave it empty to
   * route every request through the CineLog API instead.
   */
  tmdbApiKey: readString(process.env.EXPO_PUBLIC_TMDB_API_KEY),
  firebase: {
    apiKey: readString(process.env.EXPO_PUBLIC_FIREBASE_API_KEY),
    authDomain: readString(process.env.EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN),
    projectId: readString(process.env.EXPO_PUBLIC_FIREBASE_PROJECT_ID),
    storageBucket: readString(process.env.EXPO_PUBLIC_FIREBASE_STORAGE_BUCKET),
    messagingSenderId: readString(
      process.env.EXPO_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
    ),
    appId: readString(process.env.EXPO_PUBLIC_FIREBASE_APP_ID),
    iosClientId: readString(process.env.EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID),
    androidClientId: readString(
      process.env.EXPO_PUBLIC_GOOGLE_ANDROID_CLIENT_ID,
    ),
    webClientId: readString(process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID),
  },
} as const;

export const hasDirectTmdbKey = ENV.tmdbApiKey.length > 0;
