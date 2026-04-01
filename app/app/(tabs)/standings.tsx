/**
 * (tabs)/standings.tsx — hidden tab, redirects to the Sport module hub.
 * Standings are rendered inside SportModuleHub (explore pane).
 */
import { useEffect } from "react";
import { useRouter } from "expo-router";

export default function StandingsTabRedirect() {
  const router = useRouter();
  useEffect(() => { router.replace("/sport"); }, [router]);
  return null;
}
