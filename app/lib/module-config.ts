export type ProductMode = "all" | "sports_only" | "media_only" | "iptv_only" | "sports_media" | "sports_iptv" | "media_iptv" | "none";

export type ModuleVisibility = {
  sportsEnabled: boolean;
  moviesEnabled: boolean;
  iptvEnabled: boolean;
};

export function getEnabledModuleCount(visibility: ModuleVisibility): number {
  return [visibility.sportsEnabled, visibility.moviesEnabled, visibility.iptvEnabled].filter(Boolean).length;
}

export function getProductMode(visibility: ModuleVisibility): ProductMode {
  const { sportsEnabled, moviesEnabled, iptvEnabled } = visibility;

  if (sportsEnabled && moviesEnabled && iptvEnabled) return "all";
  if (sportsEnabled && moviesEnabled) return "sports_media";
  if (sportsEnabled && iptvEnabled) return "sports_iptv";
  if (moviesEnabled && iptvEnabled) return "media_iptv";
  if (sportsEnabled) return "sports_only";
  if (moviesEnabled) return "media_only";
  if (iptvEnabled) return "iptv_only";
  return "none";
}
