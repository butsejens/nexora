import React from "react";
import { VodModuleHub } from "@/components/vod/VodModuleHub";

export default function MoviesScreen() {
  return <VodModuleHub initialPane="home" initialFilter="movie" />;
}