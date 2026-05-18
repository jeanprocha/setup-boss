import type { RuntimeSsePhase } from "@/lib/runtime/sse/runtime-sse-types";
import type { WorkspaceRunSsePhase } from "@/lib/workspace/sse/workspace-run-sse-types";

export type UnifiedRealtimePhase = "connected" | "degraded" | "disconnected";

export type UnifiedRealtimeLabel =
  | "Realtime connected"
  | "Realtime degraded"
  | "Realtime disconnected";

const LIVE_PHASES = new Set(["connected", "degraded", "reconnecting"]);

function isLivePhase(phase: string): boolean {
  return LIVE_PHASES.has(phase);
}

function isConnectedPhase(phase: string): boolean {
  return phase === "connected";
}

/**
 * Combina SSE de projeto (runtime_event) e workspace (workspace_run.*).
 */
export function computeUnifiedRealtimePhase(opts: {
  reachable: boolean;
  projectPhase: RuntimeSsePhase;
  workspacePhase: WorkspaceRunSsePhase;
  hasProjectStream: boolean;
  hasWorkspaceStream: boolean;
}): UnifiedRealtimePhase {
  if (!opts.reachable) return "disconnected";

  const phases: string[] = [];
  if (opts.hasProjectStream) phases.push(opts.projectPhase);
  if (opts.hasWorkspaceStream) phases.push(opts.workspacePhase);

  if (phases.length === 0) return "disconnected";

  if (phases.every(isConnectedPhase)) return "connected";

  const anyConnected = phases.some(isConnectedPhase);
  const anyLive = phases.some(isLivePhase);
  const anyReconnecting = phases.some((p) => p === "reconnecting" || p === "degraded");

  if (anyConnected && (anyReconnecting || phases.some((p) => !isLivePhase(p) && p !== "idle"))) {
    return "degraded";
  }
  if (anyLive && !phases.every(isConnectedPhase)) return "degraded";
  if (phases.every((p) => p === "disconnected" || p === "idle")) return "disconnected";

  return "disconnected";
}

export function unifiedRealtimeLabel(phase: UnifiedRealtimePhase): UnifiedRealtimeLabel {
  switch (phase) {
    case "connected":
      return "Realtime connected";
    case "degraded":
      return "Realtime degraded";
    default:
      return "Realtime disconnected";
  }
}
