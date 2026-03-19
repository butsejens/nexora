import en from "@/locales/en.json";
import nl from "@/locales/nl.json";

export type Language = "en" | "nl";

const translations: Record<Language, typeof en> = { en, nl };

let currentLanguage: Language = "en";
let listeners: Array<() => void> = [];

export function setLanguage(lang: Language) {
  if (lang === currentLanguage) return;
  currentLanguage = lang;
  listeners.forEach((fn) => fn());
}

export function getLanguage(): Language {
  return currentLanguage;
}

export function subscribe(fn: () => void) {
  listeners.push(fn);
  return () => {
    listeners = listeners.filter((l) => l !== fn);
  };
}

/**
 * Get a nested translation value by dot-separated key.
 * Supports {{variable}} interpolation.
 */
export function t(key: string, params?: Record<string, string | number>): string {
  const parts = key.split(".");
  let value: unknown = translations[currentLanguage];
  for (const part of parts) {
    if (value && typeof value === "object" && part in value) {
      value = (value as Record<string, unknown>)[part];
    } else {
      // Fallback to English
      value = undefined;
      break;
    }
  }

  // Fallback to English if key not found in current language
  if (value === undefined) {
    let fallback: unknown = translations.en;
    for (const part of parts) {
      if (fallback && typeof fallback === "object" && part in fallback) {
        fallback = (fallback as Record<string, unknown>)[part];
      } else {
        return key; // Return key itself as last resort
      }
    }
    value = fallback;
  }

  if (typeof value !== "string") return key;

  if (params) {
    return value.replace(/\{\{(\w+)\}\}/g, (_, k) =>
      params[k] !== undefined ? String(params[k]) : `{{${k}}}`
    );
  }

  return value;
}
