import { useSyncExternalStore, useCallback } from "react";
import { t as translate, subscribe, getLanguage, setLanguage, type Language } from "@/lib/i18n";

function getSnapshot() {
  return getLanguage();
}

function safeTranslate(key: string, params?: Record<string, string | number>, fallback = "") {
  const translated = translate(key, params);
  if (!translated || translated === key) return fallback;
  return translated;
}

/**
 * React hook for translations. Returns { t, ts, language, setLanguage }.
 * Components using this hook re-render when the language changes.
 */
export function useTranslation() {
  const language = useSyncExternalStore(subscribe, getSnapshot, getSnapshot);

  const t = useCallback(
    (key: string, params?: Record<string, string | number>) => translate(key, params),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [language]
  );

  const ts = useCallback(
    (key: string, params?: Record<string, string | number>, fallback = "") => safeTranslate(key, params, fallback),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [language]
  );

  return { t, ts, language, setLanguage };
}
