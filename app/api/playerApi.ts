// Forwards to canonical sports-service. Use getPlayerProfile() directly in new code.
export { getPlayerProfile as fetchPlayer } from "@/lib/services/sports-service";
export type { PlayerProfileParams as FetchPlayerParams } from "@/lib/services/sports-service";
