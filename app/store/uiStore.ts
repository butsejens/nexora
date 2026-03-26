import { create } from "zustand";

type UiState = {
  compactHeader: boolean;
  setCompactHeader: (compactHeader: boolean) => void;
};

export const useUiStore = create<UiState>((set) => ({
  compactHeader: false,
  setCompactHeader: (compactHeader) => set({ compactHeader }),
}));
