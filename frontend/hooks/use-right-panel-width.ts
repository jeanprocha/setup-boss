"use client";

import { useCallback } from "react";
import {
  RIGHT_PANEL_WIDTH,
  clampRightPanelWidthPx,
} from "@/lib/ui/shell-layout";
import { useMissionLayoutStore } from "@/stores/mission-layout-store";

export function useRightPanelWidth() {
  const widthPx = useMissionLayoutStore((s) => s.rightPanelWidthPx);
  const setRightPanelWidthPx = useMissionLayoutStore(
    (s) => s.setRightPanelWidthPx,
  );

  const setWidthPx = useCallback(
    (n: number) => setRightPanelWidthPx(clampRightPanelWidthPx(n)),
    [setRightPanelWidthPx],
  );

  const resetWidth = useCallback(() => {
    setRightPanelWidthPx(RIGHT_PANEL_WIDTH.defaultPx);
  }, [setRightPanelWidthPx]);

  return {
    widthPx,
    setWidthPx,
    resetWidth,
    minPx: RIGHT_PANEL_WIDTH.minPx,
    maxPx: RIGHT_PANEL_WIDTH.maxPx,
    defaultPx: RIGHT_PANEL_WIDTH.defaultPx,
  };
}
