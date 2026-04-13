import { useEffect } from "react";
import { useIsFocused } from "@react-navigation/native";
import { clearActivePage, setActivePage } from "@/services/page-only-debug";

export function usePageOnlyDebug(pageName: string): void {
  const isFocused = useIsFocused();

  useEffect(() => {
    if (!isFocused) return;
    setActivePage(pageName);
    return () => {
      clearActivePage(pageName);
    };
  }, [isFocused, pageName]);
}
