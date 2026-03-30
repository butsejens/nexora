/**
 * (tabs)/index.tsx - Sport Tab
 * ════════════════════════════════════════════════════════════════════════════════
 * Clean wrapper that exports SportModuleHub.
 * Replaces 2887 lines of messy inline code.
 */

import React from "react";
import { SportModuleHub } from "../../components/sports/SportModuleHub";

/**
 * Sport Tab Screen
 * Displays live matches, competitions, matchday, and insights
 */
export default function SportScreen() {
  return <SportModuleHub initialPane="explore" />;
}
