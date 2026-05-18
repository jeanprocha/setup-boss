"use client";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { MissionRuntimeRoot } from "@/components/features/MissionRuntimeRoot";
import {
  applyMissionThemeClass,
  useMissionThemeStore,
} from "@/stores/mission-theme-store";

type ThemeContextValue = {
  dark: boolean;
  toggleTheme: () => void;
};

const ThemeContext = createContext<ThemeContextValue | null>(null);

export function useMissionTheme() {
  const ctx = useContext(ThemeContext);
  if (!ctx) {
    throw new Error("useMissionTheme must be used within AppProviders");
  }
  return ctx;
}

export function AppProviders({ children }: { children: ReactNode }) {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: { staleTime: 30_000, retry: 1 },
        },
      }),
  );

  const dark = useMissionThemeStore((s) => s.dark);
  const toggleTheme = useMissionThemeStore((s) => s.toggleTheme);

  useEffect(() => {
    applyMissionThemeClass(dark);
  }, [dark]);

  const theme = useMemo(
    () => ({
      dark,
      toggleTheme,
    }),
    [dark, toggleTheme],
  );

  return (
    <QueryClientProvider client={queryClient}>
      <ThemeContext.Provider value={theme}>
        <MissionRuntimeRoot>{children}</MissionRuntimeRoot>
      </ThemeContext.Provider>
    </QueryClientProvider>
  );
}
