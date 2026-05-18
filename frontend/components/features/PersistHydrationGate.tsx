"use client";

import type { ReactNode } from "react";
import { useEffect, useState } from "react";
import {
  applyMissionThemeClass,
  useMissionThemeStore,
} from "@/stores/mission-theme-store";
import { useMissionLocaleStore } from "@/stores/mission-locale-store";
import {
  importLegacyLayoutPrefsOnce,
  useMissionLayoutStore,
} from "@/stores/mission-layout-store";
import { useMissionShellStore } from "@/stores/mission-shell-store";
import { sanitizeMissionShellCrossSelection } from "@/lib/runtime/shell/mission-shell-selection-sanitize";

/**
 * Evita renderizar a shell antes de reidratar localStorage —
 * impede que o estado inicial sobrescreva preferências salvas.
 */
export function PersistHydrationGate({ children }: { children: ReactNode }) {
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let cancelled = false;

    const hydrate = async () => {
      await Promise.all([
        useMissionLayoutStore.persist.rehydrate(),
        useMissionShellStore.persist.rehydrate(),
        useMissionLocaleStore.persist.rehydrate(),
        useMissionThemeStore.persist.rehydrate(),
      ]);
      importLegacyLayoutPrefsOnce();
      applyMissionThemeClass(useMissionThemeStore.getState().dark);

      const shell = useMissionShellStore.getState();
      const sanitized = sanitizeMissionShellCrossSelection({
        selectedProjectId: shell.selectedProjectId,
        selectedRunId: shell.selectedRunId,
        selectedWorkspaceId: shell.selectedWorkspaceId,
        selectedWorkspaceRunId: shell.selectedWorkspaceRunId,
      });
      if (sanitized.changed) {
        useMissionShellStore.setState(sanitized.value);
      }

      if (!cancelled) setReady(true);
    };

    void hydrate();
    return () => {
      cancelled = true;
    };
  }, []);

  if (!ready) {
    return (
      <div
        className="flex h-dvh bg-background"
        aria-busy="true"
        aria-label="Carregando preferências"
      >
        <aside className="flex w-64 shrink-0 flex-col border-r border-border bg-sidebar">
          <div className="h-7 animate-pulse border-b border-border/50 bg-muted/20" />
          <div className="flex-1 space-y-2 p-2">
            <div className="h-6 w-2/3 animate-pulse rounded bg-muted/35" />
            <div className="h-7 w-full animate-pulse rounded bg-muted/30" />
            <div className="h-7 w-5/6 animate-pulse rounded bg-muted/30" />
            <div className="h-7 w-4/5 animate-pulse rounded bg-muted/30" />
          </div>
        </aside>
        <main className="min-w-0 flex-1 bg-background" />
      </div>
    );
  }

  return <>{children}</>;
}
