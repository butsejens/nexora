// DEPRECATED: follow state lives in UserStateContext (AsyncStorage-persisted).
// No-op stub for import compatibility.
import { create } from "zustand";
type FollowState = { teamIds: string[]; setTeamIds: (ids: string[]) => void; };
export const useFollowStore = create<FollowState>(() => ({ teamIds: [], setTeamIds: () => {} }));
