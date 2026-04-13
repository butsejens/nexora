export type ProductMode = "all" | "sports_only" | "media_only" | "none";

export type ModuleVisibility = {
  sportsEnabled: boolean;
  moviesEnabled: boolean;
};

export function getEnabledModuleCount(visibility: ModuleVisibility): number {
  return [visibility.sportsEnabled, visibility.moviesEnabled].filter(Boolean)
    .length;
}

export function getProductMode(visibility: ModuleVisibility): ProductMode {
  const { sportsEnabled, moviesEnabled } = visibility;

  if (sportsEnabled && moviesEnabled) return "all";
  if (sportsEnabled) return "sports_only";
  if (moviesEnabled) return "media_only";
  return "none";
}
