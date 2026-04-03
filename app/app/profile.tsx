import React, { useEffect } from "react";
import { router } from "expo-router";

export default function ProfileLegacyRedirect() {
  useEffect(() => {
    router.replace("/settings");
  }, []);

  return null;
}
