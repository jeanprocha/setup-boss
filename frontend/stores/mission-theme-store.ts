import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";

type MissionThemeState = {
  dark: boolean;
  setDark: (dark: boolean) => void;
  toggleTheme: () => void;
};

export const useMissionThemeStore = create<MissionThemeState>()(
  persist(
    (set) => ({
      dark: false,
      setDark: (dark) => set({ dark }),
      toggleTheme: () => set((s) => ({ dark: !s.dark })),
    }),
    {
      name: "setup-boss-mission-theme",
      storage: createJSONStorage(() => localStorage),
      partialize: (s) => ({ dark: s.dark }),
      skipHydration: true,
    },
  ),
);

export function applyMissionThemeClass(dark: boolean) {
  if (typeof document === "undefined") return;
  document.documentElement.classList.toggle("dark", dark);
}
