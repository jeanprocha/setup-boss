import { keepPreviousData } from "@tanstack/react-query";

/** Evita flicker: mantém último payload visível durante refetch (P1d). */
export const missionQueryStableOptions = {
  placeholderData: keepPreviousData,
  refetchOnWindowFocus: false,
} as const;
