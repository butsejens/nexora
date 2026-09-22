import type {
  DeviceCapabilities,
  ProviderRuntimeConfig,
  StreamProviderId,
  UserStreamPreferences,
} from "./types.ts";

/** Per-provider default timeout — Meteor/Comet resolve debrid links, which is
 * typically slower than Torrentio's plain torrent index lookup. */
export const DEFAULT_TIMEOUTS_MS: Record<StreamProviderId, number> = {
  torrentio: 6000,
  comet: 8000,
  meteor: 8000,
};

export const DEFAULT_STREAM_PREFERENCES: UserStreamPreferences = {
  autoSelectBest: true,
  maxResolution: "4k",
  preferredLanguage: "en",
  allowHdr: true,
  maxFileSizeGb: null,
};

/** Conservative default — most devices/networks handle HDR but not every
 * screen supports Dolby Vision profiles CineLog's WebView player can render. */
export const DEFAULT_DEVICE_CAPABILITIES: DeviceCapabilities = {
  supportsDolbyVision: false,
  supportsHdr: true,
};

export function defaultProviderConfig(id: StreamProviderId): ProviderRuntimeConfig {
  return {
    id,
    endpoint: "",
    enabled: false,
    timeoutMs: DEFAULT_TIMEOUTS_MS[id],
  };
}
