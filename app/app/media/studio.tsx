import { router } from "expo-router";
import { useEffect } from "react";

export default function StudioRedirect() {
  useEffect(() => {
    router.replace("/(tabs)/movies");
  }, []);

  return null;
}
