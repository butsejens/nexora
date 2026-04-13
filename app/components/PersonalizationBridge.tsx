import { useEffect } from "react";

import { useUserState } from "@/context/UserStateContext";

export function PersonalizationBridge() {
  const { isReady } = useUserState();

  useEffect(() => {
    if (!isReady) return;
    // Streaming personalization hooks can be added here.
  }, [isReady]);

  return null;
}
