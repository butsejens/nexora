import type { StreamProviderAdapter } from "../types.ts";
import { fetchStremioAddonStreams } from "./stremioAddon.ts";

export const torrentioAdapter: StreamProviderAdapter = {
  id: "torrentio",
  label: "Torrentio",
  fetchStreams: (endpoint, context, timeoutMs, signal, fetchFn) =>
    fetchStremioAddonStreams("torrentio", 0, endpoint, context, timeoutMs, signal, fetchFn),
};
