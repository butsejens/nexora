import { useSyncExternalStore, useCallback } from "react";
import { t as translate, subscribe, getLanguage, setLanguage, type Language } from "@/lib/i18n";

function getSnapshot() {
  return getLanguage();
}

/**
 * React hook for translations. Returns { t, language, setLanguage }.
 * Components using this hook re-render when the language changes.
 */
export function useTranslation() {
  const language = useSyncExternalStore(subscribe, getSnapshot, getSnapshot);

  const t = useCallback(
    (key: string, params?: Record<string, string | number>) => translate(key, params),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [language]
  );

  return { t, language, setLanguage };
}
