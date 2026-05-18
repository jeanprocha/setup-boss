"use client";

import { useCallback, useMemo } from "react";
import { translate } from "@/lib/i18n/translate";
import { messageCatalog } from "@/locales/registry";
import {
  type MissionLocale,
  useMissionLocaleStore,
} from "@/stores/mission-locale-store";

export function useI18n() {
  const locale = useMissionLocaleStore((s) => s.locale);
  const setLocale = useMissionLocaleStore((s) => s.setLocale);
  const bundle = useMemo(() => messageCatalog[locale], [locale]);

  const t = useCallback(
    (key: string, vars?: Record<string, string | number>) =>
      translate(bundle, key, vars),
    [bundle],
  );

  return { locale, setLocale, t };
}

export function getMessagesForLocale(locale: MissionLocale): Record<string, unknown> {
  return messageCatalog[locale];
}
