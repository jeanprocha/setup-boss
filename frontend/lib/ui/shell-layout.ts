export const LEFT_SIDEBAR_WIDTH = {
  defaultPx: 300,
  minPx: 240,
  maxPx: 520,
} as const;

export const RIGHT_PANEL_WIDTH = {
  defaultPx: 275,
  minPx: 240,
  maxPx: 560,
} as const;

export function clampLeftSidebarWidthPx(n: number): number {
  return Math.min(
    LEFT_SIDEBAR_WIDTH.maxPx,
    Math.max(LEFT_SIDEBAR_WIDTH.minPx, Math.round(n)),
  );
}

export function clampRightPanelWidthPx(n: number): number {
  return Math.min(
    RIGHT_PANEL_WIDTH.maxPx,
    Math.max(RIGHT_PANEL_WIDTH.minPx, Math.round(n)),
  );
}
