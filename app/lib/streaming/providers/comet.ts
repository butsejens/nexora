import type { StreamProviderAdapter } from "../types.ts";
import { fetchStremioAddonStreams } from "./stremioAddon.ts";

export const cometAdapter: StreamProviderAdapter = {
  id: "comet",
  label: "Comet",
  fetchStreams: (endpoint, context, timeoutMs, signal, fetchFn) =>
    fetchStremioAddonStreams("comet", 1, endpoint, context, timeoutMs, signal, fetchFn),
};
