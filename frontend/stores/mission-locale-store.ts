import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";

export type MissionLocale = "pt-BR" | "en";

type MissionLocaleState = {
  locale: MissionLocale;
  setLocale: (locale: MissionLocale) => void;
};

export const useMissionLocaleStore = create<MissionLocaleState>()(
  persist(
    (set) => ({
      locale: "pt-BR",
      setLocale: (locale) => set({ locale }),
    }),
    {
      name: "setup-boss-mission-locale",
      storage: createJSONStorage(() => localStorage),
      partialize: (s) => ({ locale: s.locale }),
      skipHydration: true,
    },
  ),
);
