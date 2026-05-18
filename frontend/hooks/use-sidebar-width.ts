"use client";

import { useCallback } from "react";
import {
  LEFT_SIDEBAR_WIDTH,
  clampLeftSidebarWidthPx,
} from "@/lib/ui/shell-layout";
import { useMissionLayoutStore } from "@/stores/mission-layout-store";

export function useSidebarWidth() {
  const widthPx = useMissionLayoutStore((s) => s.leftSidebarWidthPx);
  const setLeftSidebarWidthPx = useMissionLayoutStore(
    (s) => s.setLeftSidebarWidthPx,
  );

  const setWidthPx = useCallback(
    (n: number) => setLeftSidebarWidthPx(clampLeftSidebarWidthPx(n)),
    [setLeftSidebarWidthPx],
  );

  const resetWidth = useCallback(() => {
    setLeftSidebarWidthPx(LEFT_SIDEBAR_WIDTH.defaultPx);
  }, [setLeftSidebarWidthPx]);

  return {
    widthPx,
    setWidthPx,
    resetWidth,
    minPx: LEFT_SIDEBAR_WIDTH.minPx,
    maxPx: LEFT_SIDEBAR_WIDTH.maxPx,
    defaultPx: LEFT_SIDEBAR_WIDTH.defaultPx,
  };
}
