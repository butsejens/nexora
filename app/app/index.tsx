import { useEffect } from "react";
import { router } from "expo-router";

export default function RootIndexRedirect() {
  useEffect(() => {
    router.replace("/(tabs)/home");
  }, []);

  return null;
}