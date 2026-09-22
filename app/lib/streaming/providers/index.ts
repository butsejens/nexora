import type { StreamProviderAdapter, StreamProviderId } from "../types.ts";
import { torrentioAdapter } from "./torrentio.ts";
import { cometAdapter } from "./comet.ts";
import { meteorAdapter } from "./meteor.ts";

export const AUTO_PROVIDER_ADAPTERS: Record<StreamProviderId, StreamProviderAdapter> = {
  torrentio: torrentioAdapter,
  comet: cometAdapter,
  meteor: meteorAdapter,
};

export const AUTO_PROVIDER_LABELS: Record<StreamProviderId, string> = {
  torrentio: torrentioAdapter.label,
  comet: cometAdapter.label,
  meteor: meteorAdapter.label,
};

export const AUTO_PROVIDER_PRIORITY: Record<StreamProviderId, number> = {
  torrentio: 0,
  comet: 1,
  meteor: 2,
};
