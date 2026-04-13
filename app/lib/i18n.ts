/**
 * Nexora i18n
 *
 * Backed by react-i18next / i18next for full hook support.
 * Legacy API (`t`, `setLanguage`, `getLanguage`, `subscribe`) kept intact
 * so all existing call-sites continue to work without changes.
 *
 * React components can now also use the standard hooks:
 *   import { useTranslation } from 'react-i18next';
 *   const { t } = useTranslation();
 */

import i18n from "i18next";
import { initReactI18next } from "react-i18next";

import en from "@/locales/en.json";
import nl from "@/locales/nl.json";
import fr from "@/locales/fr.json";
import de from "@/locales/de.json";
import es from "@/locales/es.json";
import pt from "@/locales/pt.json";

export type Language = "en" | "nl" | "fr" | "de" | "es" | "pt";

// ─── i18next initialisation ───────────────────────────────────────────────────

i18n.use(initReactI18next).init({
  lng: "en",
  fallbackLng: "en",
  resources: {
    en: { translation: en },
    nl: { translation: nl },
    fr: { translation: fr },
    de: { translation: de },
    es: { translation: es },
    pt: { translation: pt },
  },
  interpolation: {
    // i18next uses {{var}} by default — matches our existing locale files
    escapeValue: false,
  },
  compatibilityJSON: "v4",
});

// ─── Legacy subscriber list (kept for NexoraContext compatibility) ────────────

let listeners: Array<() => void> = [];

// Keep currentLanguage in sync so getLanguage() is always accurate
i18n.on("languageChanged", () => listeners.forEach((fn) => fn()));

// ─── Public API (legacy-compatible) ──────────────────────────────────────────

export function setLanguage(lang: Language) {
  if (lang === i18n.language) return;
  i18n.changeLanguage(lang);
}

export function getLanguage(): Language {
  return (i18n.language || "en") as Language;
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
 * Delegates to i18next so react-i18next hooks and this function stay in sync.
 */
export function t(
  key: string,
  params?: Record<string, string | number>,
): string {
  const translated = i18n.t(key, params as Record<string, unknown>);
  if (translated === key) {
    // i18next returns the key itself when not found — humanize it
    return humanizeKey(key);
  }
  return String(translated);
}

function humanizeKey(key: string): string {
  const tail =
    String(key || "")
      .split(".")
      .pop() || "";
  const text = tail
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .replace(/[_-]+/g, " ")
    .trim();
  if (!text) return "Not available";
  return text.charAt(0).toUpperCase() + text.slice(1);
}

// Re-export the i18next instance and hooks so components can opt-in to them
export { i18n };
export { useTranslation, Trans } from "react-i18next";
