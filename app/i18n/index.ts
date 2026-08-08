/**
 * CineLog — interface translations.
 *
 * The English copy doubles as the lookup key, so English can never render a
 * missing string and adding a language means adding one dictionary. Keys carry
 * `{{placeholder}}` slots for values interpolated at call time.
 *
 *   const t = useT();
 *   t("Watch Trailer");
 *   t("Remove {{title}} from your watchlist", { title: item.title });
 */

import { useCallback } from "react";

import { useSettings, type LanguageCode } from "@/store/settings-store";
import { NL } from "@/i18n/nl";
import { FR } from "@/i18n/fr";

export type Dictionary = Record<string, string>;

const DICTIONARIES: Partial<Record<LanguageCode, Dictionary>> = {
  nl: NL,
  fr: FR,
};

const warned = new Set<string>();

function lookup(language: LanguageCode, key: string): string {
  const dictionary = DICTIONARIES[language];
  if (!dictionary) return key;
  const translated = dictionary[key];
  if (translated) return translated;
  if (__DEV__ && !warned.has(`${language}:${key}`)) {
    warned.add(`${language}:${key}`);
    console.warn(`[cinelog:i18n] missing ${language} translation: "${key}"`);
  }
  return key;
}

function interpolate(
  text: string,
  values?: Record<string, string | number>,
): string {
  if (!values) return text;
  return text.replace(/\{\{(\w+)\}\}/g, (_, name: string) =>
    String(values[name] ?? `{{${name}}}`),
  );
}

export type Translate = (
  key: string,
  values?: Record<string, string | number>,
) => string;

export function useT(): Translate {
  const language = useSettings((state) => state.language);
  return useCallback(
    (key: string, values?: Record<string, string | number>) =>
      interpolate(lookup(language, key), values),
    [language],
  );
}

const LOCALES: Record<LanguageCode, string> = {
  en: "en-GB",
  nl: "nl-NL",
  fr: "fr-FR",
};

/** BCP 47 locale matching the interface language, for date and number output. */
export function useLocale(): string {
  return LOCALES[useSettings((state) => state.language)];
}

/** Translate outside React (navigation labels built at module scope, etc.). */
export function translate(
  key: string,
  values?: Record<string, string | number>,
): string {
  const language = useSettings.getState().language;
  return interpolate(lookup(language, key), values);
}
