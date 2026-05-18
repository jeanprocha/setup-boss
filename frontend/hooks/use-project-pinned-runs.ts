"use client";

import { useCallback, useEffect, useState } from "react";
import type { RunSummaryDto } from "@/lib/api/runtime-types";

const STORAGE_KEY = "setup-boss-project-pinned-runs-v1";
export const MAX_PINNED_RUNS_PER_PROJECT = 5;

export type PinnedRunsMap = Record<string, string[]>;

function runKey(r: RunSummaryDto): string {
  return r.runId ?? r.id;
}

function readStore(): PinnedRunsMap {
  if (typeof window === "undefined") return {};
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed))
      return {};
    const out: PinnedRunsMap = {};
    for (const [pid, arr] of Object.entries(parsed)) {
      if (!pid || !Array.isArray(arr)) continue;
      const keys = arr
        .filter((x): x is string => typeof x === "string" && x.length > 0)
        .slice(0, MAX_PINNED_RUNS_PER_PROJECT);
      const dedup = [...new Set(keys)].slice(0, MAX_PINNED_RUNS_PER_PROJECT);
      if (dedup.length) out[pid] = dedup;
    }
    return out;
  } catch {
    return {};
  }
}

function writeStore(map: PinnedRunsMap) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(map));
  } catch {
    /* */
  }
}

/** Ordem da API mantida dentro de cada grupo; pins na ordem gravada. */
export function sortRunsWithPins(
  projectRuns: RunSummaryDto[],
  pinnedOrder: string[],
): RunSummaryDto[] {
  const keys = (r: RunSummaryDto) => runKey(r);
  const keySet = new Set(projectRuns.map(keys));
  const validPins = pinnedOrder.filter((k) => keySet.has(k));
  const pinnedSet = new Set(validPins);
  const unpinned = projectRuns.filter((r) => !pinnedSet.has(keys(r)));
  const pinnedRuns = validPins
    .map((k) => projectRuns.find((r) => keys(r) === k))
    .filter((r): r is RunSummaryDto => r != null);
  return [...pinnedRuns, ...unpinned];
}

export function useProjectPinnedRuns() {
  const [map, setMap] = useState<PinnedRunsMap>({});

  useEffect(() => {
    setMap(readStore());
  }, []);

  const getPins = useCallback(
    (projectId: string) => map[projectId] ?? [],
    [map],
  );

  const togglePin = useCallback(
    (
      projectId: string,
      runKey: string,
      validKeysInProject: Set<string>,
    ): { ok: true } | { ok: false; reason: "max_pins" } => {
      let rejected: false | "max_pins" = false;
      setMap((prev) => {
        const raw = prev[projectId] ?? [];
        const filtered = raw.filter((k) => validKeysInProject.has(k));
        const idx = filtered.indexOf(runKey);
        let nextList: string[];
        if (idx >= 0) {
          nextList = filtered.filter((k) => k !== runKey);
        } else {
          if (filtered.length >= MAX_PINNED_RUNS_PER_PROJECT) {
            rejected = "max_pins";
            return prev;
          }
          nextList = [runKey, ...filtered.filter((k) => k !== runKey)];
        }
        const next: PinnedRunsMap = { ...prev };
        if (nextList.length === 0) delete next[projectId];
        else next[projectId] = nextList;
        writeStore(next);
        return next;
      });
      return rejected ? { ok: false, reason: "max_pins" } : { ok: true };
    },
    [],
  );

  const clearPinsForProject = useCallback((projectId: string) => {
    setMap((prev) => {
      if (!(projectId in prev)) return prev;
      const next = { ...prev };
      delete next[projectId];
      writeStore(next);
      return next;
    });
  }, []);

  return { getPins, togglePin, clearPinsForProject };
}
