import type { StreamProviderAdapter } from "../types.ts";
import { fetchStremioAddonStreams } from "./stremioAddon.ts";

export const meteorAdapter: StreamProviderAdapter = {
  id: "meteor",
  label: "Meteor",
  fetchStreams: (endpoint, context, timeoutMs, signal, fetchFn) =>
    fetchStremioAddonStreams("meteor", 2, endpoint, context, timeoutMs, signal, fetchFn),
};
