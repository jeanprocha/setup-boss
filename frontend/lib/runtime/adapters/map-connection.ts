import type {
  RuntimeConnectionState,
  RuntimeHealthDto,
} from "@/lib/api/runtime-types";

export function buildRuntimeConnectionState(input: {
  health: RuntimeHealthDto | null;
  healthError: boolean;
  queueHealth: "ok" | "degraded" | "unknown";
  lastError: string | null;
}): RuntimeConnectionState {
  const reachable = Boolean(input.health?.ok) && !input.healthError;
  const degraded =
    reachable && input.queueHealth === "degraded";
  const daemon =
    input.health?.daemon === "running" || input.health?.daemon === "stopped"
      ? input.health.daemon
      : "unknown";

  return {
    reachable,
    degraded,
    dataSource: reachable ? "runtime" : "offline",
    lastError: input.lastError,
    daemon,
  };
}
