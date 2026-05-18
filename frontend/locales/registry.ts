import { en } from "@/locales/en";
import { ptBR } from "@/locales/pt-BR";
import type { MissionLocale } from "@/stores/mission-locale-store";

export const messageCatalog: Record<
  MissionLocale,
  Record<string, unknown>
> = {
  "pt-BR": ptBR as unknown as Record<string, unknown>,
  en: en as unknown as Record<string, unknown>,
};
