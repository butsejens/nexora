import React from "react";
import { useFocusEffect, useRouter } from "expo-router";

export default function RootIndexRedirect() {
  const router = useRouter();

  useFocusEffect(
    React.useCallback(() => {
      router.replace("/(tabs)/home");
    }, [router])
  );

  return null;
}