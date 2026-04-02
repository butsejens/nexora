// Forwards to canonical sports-service. Use getTeamOverview() directly in new code.
export { getTeamOverview as fetchTeam } from "@/lib/services/sports-service";
export type { UseSportTeamParams as FetchTeamParams } from "@/hooks/useSportTeam";
