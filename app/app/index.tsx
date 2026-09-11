import React from "react";
import { Redirect } from "expo-router";

import { SeoHead } from "@/components/SeoHead";

/**
 * CineLog opens straight onto content — no dashboard, no setup wizard. Browsing
 * works without an account; signing in is only needed to sync a library.
 *
 * The head tags matter here too: `/` is the canonical entry point, so crawlers
 * that don't follow the redirect still get the brand title and share card.
 */
export default function Index() {
  return (
    <>
      <SeoHead />
      <Redirect href="/(tabs)/home" />
    </>
  );
}
