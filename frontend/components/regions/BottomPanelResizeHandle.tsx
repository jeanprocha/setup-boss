"use client";

import { useMissionShellStore } from "@/stores/mission-shell-store";
import { useCallback, useRef } from "react";

export function BottomPanelResizeHandle() {
  const setHeight = useMissionShellStore((s) => s.setBottomPanelHeightPx);
  const startY = useRef(0);
  const startH = useRef(0);

  const onPointerDown = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      e.preventDefault();
      const el = e.currentTarget;
      el.setPointerCapture(e.pointerId);
      startY.current = e.clientY;
      startH.current = useMissionShellStore.getState().bottomPanelHeightPx;

      const onMove = (ev: PointerEvent) => {
        const delta = startY.current - ev.clientY;
        setHeight(startH.current + delta);
      };
      const onUp = (ev: PointerEvent) => {
        el.releasePointerCapture(ev.pointerId);
        window.removeEventListener("pointermove", onMove);
        window.removeEventListener("pointerup", onUp);
      };
      window.addEventListener("pointermove", onMove);
      window.addEventListener("pointerup", onUp);
    },
    [setHeight],
  );

  return (
    <div
      role="separator"
      aria-orientation="horizontal"
      aria-label="Redimensionar painel inferior"
      onPointerDown={onPointerDown}
      className="group relative z-20 h-2 shrink-0 cursor-row-resize border-t border-border bg-muted/30 hover:bg-muted/50"
    >
      <div className="pointer-events-none absolute inset-x-0 top-1/2 mx-auto h-0.5 w-10 -translate-y-1/2 rounded-full bg-border opacity-70 group-hover:opacity-100" />
    </div>
  );
}
