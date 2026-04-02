import { useQuery } from "@tanstack/react-query";
import { fetchTeam, type FetchTeamParams } from "@/api/teamApi";

const FIVE_MINUTES = 5 * 60 * 1000;
const FIFTEEN_MINUTES = 15 * 60 * 1000;

// Forwards to the canonical useSportTeam hook (unified React Query cache key via sportKeys)
export { useSportTeam as useTeam } from "@/hooks/useSportTeam";
export type { UseSportTeamParams as FetchTeamParams } from "@/hooks/useSportTeam";
