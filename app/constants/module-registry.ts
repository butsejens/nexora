export type AppModuleId =
  | "sport"
  | "filmsSeries"
  | "iptv"
  | "watchlist"
  | "history"
  | "notifications"
  | "settings"
  | "premium";

export type AppModuleDefinition = {
  id: AppModuleId;
  label: string;
  subtitle: string;
  icon: string;
  route: string;
  section: "core" | "library" | "system";
};

export const APP_SHELL_TABS = {
  home: "/(tabs)/home",
  search: "/(tabs)/search",
  menu: "/(tabs)/more",
} as const;

export const APP_MODULE_REGISTRY: AppModuleDefinition[] = [
  {
    id: "sport",
    label: "Sport",
    subtitle: "Live center, fixtures and competition data",
    icon: "football-outline",
    route: "/sport",
    section: "core",
  },
  {
    id: "filmsSeries",
    label: "Films & Series",
    subtitle: "Trending films, episodes and curated picks",
    icon: "film-outline",
    route: "/films-series",
    section: "core",
  },
  {
    id: "iptv",
    label: "IPTV",
    subtitle: "Open channels and playlist streams",
    icon: "tv-outline",
    route: "/iptv",
    section: "core",
  },
  {
    id: "watchlist",
    label: "Watchlist",
    subtitle: "Saved titles and channels",
    icon: "bookmark-outline",
    route: "/watchlist",
    section: "library",
  },
  {
    id: "history",
    label: "History",
    subtitle: "Recently watched overview",
    icon: "time-outline",
    route: "/history",
    section: "library",
  },
  {
    id: "notifications",
    label: "Notifications",
    subtitle: "Follow alerts and updates",
    icon: "notifications-outline",
    route: "/notifications",
    section: "library",
  },
  {
    id: "settings",
    label: "Settings",
    subtitle: "Modules, onboarding and preferences",
    icon: "settings-outline",
    route: "/settings",
    section: "system",
  },
  {
    id: "premium",
    label: "Premium",
    subtitle: "AI analysis + full access from €2.99/week",
    icon: "diamond-outline",
    route: "/premium",
    section: "system",
  },
];

export const APP_MODULES_BY_ID = APP_MODULE_REGISTRY.reduce<Record<AppModuleId, AppModuleDefinition>>(
  (acc, moduleDef) => {
    acc[moduleDef.id] = moduleDef;
    return acc;
  },
  {} as Record<AppModuleId, AppModuleDefinition>,
);