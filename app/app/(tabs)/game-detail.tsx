/**
 * (tabs)/game-detail.tsx — hidden tab legacy stub.
 * Proper match detail is at the /match-detail stack route.
 */
import { useEffect } from "react";
import { useRouter } from "expo-router";

export default function GameDetailTabRedirect() {
  const router = useRouter();
  useEffect(() => { router.replace("/sport"); }, [router]);
  return null;
}
