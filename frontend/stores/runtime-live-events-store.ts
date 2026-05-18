import { create } from "zustand";
import type { RuntimeEventDto } from "@/lib/api/runtime-types";
import { dedupeRuntimeEvents } from "@/lib/runtime/observability/dedupe-runtime-events";

const MAX_LIVE = 300;

type LiveEventsState = {
  byId: Map<string, RuntimeEventDto>;
  order: string[];
  upsert: (ev: RuntimeEventDto) => boolean;
  getMerged: (base: RuntimeEventDto[]) => RuntimeEventDto[];
  clear: () => void;
};

export const useRuntimeLiveEventsStore = create<LiveEventsState>((set, get) => ({
  byId: new Map(),
  order: [],
  upsert: (ev) => {
    const state = get();
    if (state.byId.has(ev.id)) return false;
    const byId = new Map(state.byId);
    byId.set(ev.id, ev);
    let order = [...state.order, ev.id];
    if (order.length > MAX_LIVE) {
      const drop = order.length - MAX_LIVE;
      const removed = order.slice(0, drop);
      order = order.slice(drop);
      for (const id of removed) byId.delete(id);
    }
    set({ byId, order });
    return true;
  },
  getMerged: (base) => {
    const { byId, order } = get();
    const seen = new Set<string>();
    const out: RuntimeEventDto[] = [];
    for (const e of base) {
      if (!seen.has(e.id)) {
        seen.add(e.id);
        out.push(e);
      }
    }
    for (const id of order) {
      const e = byId.get(id);
      if (e && !seen.has(e.id)) {
        seen.add(e.id);
        out.push(e);
      }
    }
    return dedupeRuntimeEvents(out);
  },
  clear: () => set({ byId: new Map(), order: [] }),
}));
