"use client";

import { useCallback, useEffect, useRef, useState } from "react";

/**
 * Durante scroll, estima o passo mais visível (área central) para destacar na sidebar direita.
 */
export function useExecutionScrollSpy(opts: {
  rootRef: React.RefObject<HTMLElement | null>;
  stepDomIds: readonly string[];
  fallbackIndex: number;
}) {
  const { rootRef, stepDomIds, fallbackIndex } = opts;
  const [visibleIndex, setVisibleIndex] = useState<number | null>(null);
  const observerRef = useRef<IntersectionObserver | null>(null);

  const rebind = useCallback(() => {
    observerRef.current?.disconnect();
    const root = rootRef.current;
    if (!root || stepDomIds.length === 0) return;

    const obs = new IntersectionObserver(
      (list) => {
        let bestIdx = -1;
        let bestRatio = 0;
        for (const entry of list) {
          if (!entry.isIntersecting || entry.intersectionRatio < 0.06) continue;
          const idxAttr = entry.target.getAttribute("data-exec-step-index");
          const idx = idxAttr != null ? Number.parseInt(idxAttr, 10) : NaN;
          if (Number.isNaN(idx)) continue;
          if (entry.intersectionRatio > bestRatio) {
            bestRatio = entry.intersectionRatio;
            bestIdx = idx;
          }
        }
        if (bestIdx >= 0) setVisibleIndex(bestIdx);
      },
      {
        root,
        rootMargin: "-18% 0px -38% 0px",
        threshold: [0, 0.08, 0.2, 0.35, 0.55, 0.75, 1],
      },
    );

    for (let i = 0; i < stepDomIds.length; i++) {
      const el = document.getElementById(stepDomIds[i]!);
      if (el) {
        el.setAttribute("data-exec-step-index", String(i));
        obs.observe(el);
      }
    }
    observerRef.current = obs;
  }, [rootRef, stepDomIds]);

  useEffect(() => {
    rebind();
    return () => observerRef.current?.disconnect();
  }, [rebind]);

  const effective = visibleIndex != null ? visibleIndex : fallbackIndex;

  return { highlightedIndex: effective };
}
