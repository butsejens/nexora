import { create } from "zustand";

type FollowState = {
  teamIds: string[];
  setTeamIds: (teamIds: string[]) => void;
};

export const useFollowStore = create<FollowState>((set) => ({
  teamIds: [],
  setTeamIds: (teamIds) => set({ teamIds }),
}));
