"use client";

import { useMemo } from "react";
import { useRuntimeConnectionStore } from "@/stores/runtime-connection-store";
import { useRuntimeSseStore } from "@/stores/runtime-sse-store";
import { useWorkspaceRunSseStore } from "@/stores/workspace-run-sse-store";
import { useMissionShellStore } from "@/stores/mission-shell-store";
import {
  computeUnifiedRealtimePhase,
  unifiedRealtimeLabel,
  type UnifiedRealtimePhase,
} from "@/lib/workspace/realtime/unified-realtime-status";

export function useUnifiedRealtimeStatus(): {
  phase: UnifiedRealtimePhase;
  label: ReturnType<typeof unifiedRealtimeLabel>;
} {
  const reachable = useRuntimeConnectionStore((s) => s.connection.reachable);
  const projectPhase = useRuntimeSseStore((s) => s.phase);
  const workspacePhase = useWorkspaceRunSseStore((s) => s.phase);
  const selectedProjectId = useMissionShellStore((s) => s.selectedProjectId);
  const selectedWorkspaceId = useMissionShellStore((s) => s.selectedWorkspaceId);

  return useMemo(() => {
    const phase = computeUnifiedRealtimePhase({
      reachable,
      projectPhase,
      workspacePhase,
      hasProjectStream: Boolean(selectedProjectId),
      hasWorkspaceStream: Boolean(selectedWorkspaceId),
    });
    return { phase, label: unifiedRealtimeLabel(phase) };
  }, [
    reachable,
    projectPhase,
    workspacePhase,
    selectedProjectId,
    selectedWorkspaceId,
  ]);
}
