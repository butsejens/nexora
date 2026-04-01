/**
 * (tabs)/teams.tsx — hidden tab, redirects to the Sport module hub.
 */
import { useEffect } from "react";
import { useRouter } from "expo-router";

export default function TeamsTabRedirect() {
  const router = useRouter();
  useEffect(() => { router.replace("/sport"); }, [router]);
  return null;
}
