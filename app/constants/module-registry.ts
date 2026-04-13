export type AppModuleId =
  | "liveTV"
  | "movies"
  | "series"
  | "myList"
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
    id: "liveTV",
    label: "Live TV",
    subtitle: "Live channels, news, entertainment and more",
    icon: "tv-outline",
    route: "/(tabs)/live-tv",
    section: "core",
  },
  {
    id: "movies",
    label: "Movies",
    subtitle: "Cinematic films, 4K quality, new releases",
    icon: "film-outline",
    route: "/(tabs)/movies",
    section: "core",
  },
  {
    id: "series",
    label: "Series",
    subtitle: "Binge-worthy originals and top series",
    icon: "play-circle-outline",
    route: "/(tabs)/series",
    section: "core",
  },
  {
    id: "myList",
    label: "My List",
    subtitle: "Saved titles ready to watch",
    icon: "bookmark-outline",
    route: "/(tabs)/my-list",
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
    subtitle: "New releases and updates",
    icon: "notifications-outline",
    route: "/notifications",
    section: "library",
  },
  {
    id: "settings",
    label: "Settings",
    subtitle: "Preferences and account settings",
    icon: "settings-outline",
    route: "/settings",
    section: "system",
  },
  {
    id: "premium",
    label: "Premium",
    subtitle: "Full access — 4K, downloads, no ads",
    icon: "diamond-outline",
    route: "/premium",
    section: "system",
  },
];

export const APP_MODULES_BY_ID = APP_MODULE_REGISTRY.reduce<
  Record<AppModuleId, AppModuleDefinition>
>(
  (acc, moduleDef) => {
    acc[moduleDef.id] = moduleDef;
    return acc;
  },
  {} as Record<AppModuleId, AppModuleDefinition>,
);
