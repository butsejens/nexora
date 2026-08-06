/**
 * Nexora — Accent color hook
 * Single source of truth for the app's dynamic accent color, driven by the
 * color the user picked during account setup (first launch / after reset).
 */
import { useUserAccountStore } from "@/store/userAccountStore";

export function useAccentColor(): string {
  return useUserAccountStore((state) => state.info.accentColor);
}
