import { create } from "zustand";

type UiState = {
  compactHeader: boolean;
  setCompactHeader: (compactHeader: boolean) => void;
  nexoraMenuOpen: boolean;
  openNexoraMenu: () => void;
  closeNexoraMenu: () => void;
  toggleNexoraMenu: () => void;
  introPlaying: boolean;
  setIntroPlaying: (playing: boolean) => void;
};

export const useUiStore = create<UiState>((set) => ({
  compactHeader: false,
  setCompactHeader: (compactHeader) => set({ compactHeader }),
  nexoraMenuOpen: false,
  openNexoraMenu: () => set({ nexoraMenuOpen: true }),
  closeNexoraMenu: () => set({ nexoraMenuOpen: false }),
  toggleNexoraMenu: () =>
    set((state) => ({ nexoraMenuOpen: !state.nexoraMenuOpen })),
  introPlaying: true,
  setIntroPlaying: (playing) => set({ introPlaying: playing }),
}));
