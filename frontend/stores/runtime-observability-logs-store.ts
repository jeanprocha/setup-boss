import { create } from "zustand";
import type { ObservabilityDaemonLogEntryDto } from "@/lib/api/runtime-types";

const MAX_PER_RUN = 500;

type RunBucket = {
  byId: Map<string, ObservabilityDaemonLogEntryDto>;
  order: string[];
};

type ObservabilityLogsState = {
  buckets: Map<string, RunBucket>;
  ingestDaemonEntries: (
    runKey: string,
    entries: ObservabilityDaemonLogEntryDto[],
  ) => void;
  getDaemonEntries: (runKey: string) => ObservabilityDaemonLogEntryDto[];
  clearRun: (runKey: string) => void;
};

function getBucket(map: Map<string, RunBucket>, runKey: string): RunBucket {
  let b = map.get(runKey);
  if (!b) {
    b = { byId: new Map(), order: [] };
    map.set(runKey, b);
  }
  return b;
}

export const useRuntimeObservabilityLogsStore = create<ObservabilityLogsState>(
  (set, get) => ({
    buckets: new Map(),
    ingestDaemonEntries: (runKey, entries) => {
      if (!runKey || !entries.length) return;
      const state = get();
      const buckets = new Map(state.buckets);
      const bucket = getBucket(buckets, runKey);
      const byId = new Map(bucket.byId);
      let order = [...bucket.order];
      let changed = false;
      for (const e of entries) {
        if (!e.id) continue;
        const existing = byId.get(e.id);
        if (existing) {
          // Preserva tsIso fixado na primeira ingestão (poll/SSE não reescreve horário).
          if (!existing.tsIso && e.tsIso) {
            byId.set(e.id, { ...existing, tsIso: e.tsIso });
            changed = true;
          }
          continue;
        }
        const stable: ObservabilityDaemonLogEntryDto = {
          ...e,
          tsIso: e.tsIso ?? new Date().toISOString(),
        };
        byId.set(e.id, stable);
        order.push(e.id);
        changed = true;
      }
      if (!changed) return;
      if (order.length > MAX_PER_RUN) {
        const drop = order.length - MAX_PER_RUN;
        const removed = order.slice(0, drop);
        order = order.slice(drop);
        for (const id of removed) byId.delete(id);
      }
      buckets.set(runKey, { byId, order });
      set({ buckets });
    },
    getDaemonEntries: (runKey) => {
      const bucket = get().buckets.get(runKey);
      if (!bucket) return [];
      return bucket.order
        .map((id) => bucket.byId.get(id))
        .filter((e): e is ObservabilityDaemonLogEntryDto => Boolean(e));
    },
    clearRun: (runKey) => {
      const buckets = new Map(get().buckets);
      buckets.delete(runKey);
      set({ buckets });
    },
  }),
);
