import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";
import {
  clampLeftSidebarWidthPx,
  clampRightPanelWidthPx,
  LEFT_SIDEBAR_WIDTH,
  RIGHT_PANEL_WIDTH,
} from "@/lib/ui/shell-layout";

export type RightPanelTab = "chat_files" | "observe";

/** Sub-abas planas dentro de Observabilidade. */
export type ObservabilitySubTab = "runtime_logs" | "technical";

const LEGACY_IMPORT_FLAG = "setup-boss-mission-layout-legacy-imported";

type MissionLayoutState = {
  sidebarCompact: boolean;
  rightTimelineOpen: boolean;
  rightPanelTab: RightPanelTab;
  observeSubTab: ObservabilitySubTab;
  leftSidebarWidthPx: number;
  rightPanelWidthPx: number;
  toggleSidebar: () => void;
  setSidebarCompact: (compact: boolean) => void;
  toggleRightTimeline: () => void;
  setRightTimelineOpen: (open: boolean) => void;
  setRightPanelTab: (tab: RightPanelTab) => void;
  setObserveSubTab: (tab: ObservabilitySubTab) => void;
  setLeftSidebarWidthPx: (px: number) => void;
  setRightPanelWidthPx: (px: number) => void;
};

export const useMissionLayoutStore = create<MissionLayoutState>()(
  persist(
    (set) => ({
      sidebarCompact: false,
      rightTimelineOpen: false,
      rightPanelTab: "chat_files",
      observeSubTab: "runtime_logs",
      leftSidebarWidthPx: LEFT_SIDEBAR_WIDTH.defaultPx,
      rightPanelWidthPx: RIGHT_PANEL_WIDTH.defaultPx,
      toggleSidebar: () =>
        set((s) => ({ sidebarCompact: !s.sidebarCompact })),
      setSidebarCompact: (compact) => set({ sidebarCompact: compact }),
      toggleRightTimeline: () =>
        set((s) => ({ rightTimelineOpen: !s.rightTimelineOpen })),
      setRightTimelineOpen: (open) => set({ rightTimelineOpen: open }),
      setRightPanelTab: (tab) => set({ rightPanelTab: tab }),
      setObserveSubTab: (tab) => set({ observeSubTab: tab }),
      setLeftSidebarWidthPx: (px) =>
        set({ leftSidebarWidthPx: clampLeftSidebarWidthPx(px) }),
      setRightPanelWidthPx: (px) =>
        set({ rightPanelWidthPx: clampRightPanelWidthPx(px) }),
    }),
    {
      name: "setup-boss-mission-layout",
      version: 4,
      storage: createJSONStorage(() => localStorage),
      partialize: (s) => ({
        sidebarCompact: s.sidebarCompact,
        rightTimelineOpen: s.rightTimelineOpen,
        rightPanelTab: s.rightPanelTab,
        observeSubTab: s.observeSubTab,
        leftSidebarWidthPx: s.leftSidebarWidthPx,
        rightPanelWidthPx: s.rightPanelWidthPx,
      }),
      skipHydration: true,
      migrate: (persisted, fromVersion) => {
        const state = persisted as Partial<MissionLayoutState> & {
          observeSubTab?: string;
          rightPanelTab?: string;
        };
        let next = { ...state };
        if (fromVersion < 3) {
          const sub = state.observeSubTab;
          next.observeSubTab =
            sub === "technical" ? "technical" : "runtime_logs";
        }
        if (fromVersion < 4) {
          next.rightPanelTab =
            state.rightPanelTab === "observe" ? "observe" : "chat_files";
        }
        return next as MissionLayoutState;
      },
    },
  ),
);

function readLegacyWidth(key: string): number | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return null;
    const n = Number(raw);
    return Number.isFinite(n) ? n : null;
  } catch {
    return null;
  }
}

/** Importa preferências antigas (shell v2/v3 + chaves de largura) uma única vez. */
export function importLegacyLayoutPrefsOnce() {
  if (typeof window === "undefined") return;
  if (localStorage.getItem(LEGACY_IMPORT_FLAG)) return;
  if (localStorage.getItem("setup-boss-mission-layout")) {
    localStorage.setItem(LEGACY_IMPORT_FLAG, "1");
    return;
  }

  const patch: Partial<
    Pick<
      MissionLayoutState,
      | "sidebarCompact"
      | "rightTimelineOpen"
      | "rightPanelTab"
      | "leftSidebarWidthPx"
      | "rightPanelWidthPx"
    >
  > = {};

  try {
    const raw = localStorage.getItem("setup-boss-mission-shell");
    if (raw) {
      const parsed = JSON.parse(raw) as {
        state?: Record<string, unknown>;
      };
      const s = parsed.state ?? (parsed as Record<string, unknown>);
      if (typeof s.sidebarCompact === "boolean") {
        patch.sidebarCompact = s.sidebarCompact;
      }
      if (typeof s.rightTimelineOpen === "boolean") {
        patch.rightTimelineOpen = s.rightTimelineOpen;
      }
      if (s.rightPanelTab === "chat_files" || s.rightPanelTab === "observe") {
        patch.rightPanelTab = s.rightPanelTab;
      } else if (s.rightPanelTab === "steps") {
        patch.rightPanelTab = "chat_files";
      }
      if (typeof s.leftSidebarWidthPx === "number") {
        patch.leftSidebarWidthPx = clampLeftSidebarWidthPx(s.leftSidebarWidthPx);
      }
      if (typeof s.rightPanelWidthPx === "number") {
        patch.rightPanelWidthPx = clampRightPanelWidthPx(s.rightPanelWidthPx);
      }
    }
  } catch {
    /* */
  }

  const legacyLeft = readLegacyWidth("setup-boss-sidebar-width");
  const legacyRight =
    readLegacyWidth("setup-boss-right-panel-width-v2") ??
    readLegacyWidth("setup-boss-right-panel-width");
  if (legacyLeft != null) {
    patch.leftSidebarWidthPx = clampLeftSidebarWidthPx(legacyLeft);
  }
  if (legacyRight != null) {
    patch.rightPanelWidthPx = clampRightPanelWidthPx(legacyRight);
  }

  if (Object.keys(patch).length > 0) {
    useMissionLayoutStore.setState(patch);
  }

  localStorage.setItem(LEGACY_IMPORT_FLAG, "1");
}
