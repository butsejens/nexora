import React from "react";
import { VodModuleHub } from "@/components/vod/VodModuleHub";

export default function SeriesScreen() {
  return <VodModuleHub initialPane="search" initialFilter="series" />;
}