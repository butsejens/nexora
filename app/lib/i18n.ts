import en from "@/locales/en.json";
import nl from "@/locales/nl.json";

export type Language = "en" | "nl";

const translations: Record<Language, typeof en> = { en, nl };

let currentLanguage: Language = "en";
let listeners: Array<() => void> = [];

function humanizeKey(key: string): string {
  const tail = String(key || "").split(".").pop() || "";
  const text = tail
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .replace(/[_-]+/g, " ")
    .trim();
  if (!text) return "Not available";
  return text.charAt(0).toUpperCase() + text.slice(1);
}

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
        return humanizeKey(key);
      }
    }
    value = fallback;
  }

  if (typeof value !== "string") return humanizeKey(key);

  if (params) {
    return value.replace(/\{\{(\w+)\}\}/g, (_, k) =>
      params[k] !== undefined ? String(params[k]) : `{{${k}}}`
    );
  }

  return value;
}
