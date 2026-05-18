import type { RuntimeHeartbeatDto } from "@/lib/api/runtime-types";

export type RuntimeHealthVisual = "online" | "offline" | "unknown";
export type WorkerStateVisual = "idle" | "busy" | "unknown";

export type RuntimeOperationalContext = {
  runtimeHealth: RuntimeHealthVisual;
  workerState: WorkerStateVisual;
  isRunActivelyProcessing: boolean;
  workerIdleNoJob: boolean;
  daemonAlive: boolean | null;
  currentRunId: string | null;
};

export function deriveRuntimeOperationalContext(opts: {
  heartbeat: RuntimeHeartbeatDto | null | undefined;
  runKey: string | null | undefined;
  uiActivelyProcessing: boolean;
}): RuntimeOperationalContext {
  const { heartbeat, runKey, uiActivelyProcessing } = opts;

  if (!heartbeat) {
    return {
      runtimeHealth: "unknown",
      workerState: "unknown",
      isRunActivelyProcessing: uiActivelyProcessing,
      workerIdleNoJob: false,
      daemonAlive: null,
      currentRunId: null,
    };
  }

  const runtimeHealth: RuntimeHealthVisual = heartbeat.daemonAlive ? "online" : "offline";
  const workerState: WorkerStateVisual = heartbeat.workerState;
  const workerIdleNoJob =
    workerState === "idle" &&
    heartbeat.runningJobsCount <= 0 &&
    !heartbeat.currentJobId;

  let isRunActivelyProcessing = uiActivelyProcessing;
  if (uiActivelyProcessing && runKey) {
    if (heartbeat.currentRunId) {
      isRunActivelyProcessing = heartbeat.currentRunId === String(runKey);
    } else if (workerIdleNoJob) {
      isRunActivelyProcessing = false;
    } else if (workerState === "busy" && heartbeat.currentJobId) {
      isRunActivelyProcessing = String(heartbeat.currentJobId) === String(runKey);
    }
  }

  return {
    runtimeHealth,
    workerState,
    isRunActivelyProcessing,
    workerIdleNoJob,
    daemonAlive: heartbeat.daemonAlive,
    currentRunId: heartbeat.currentRunId,
  };
}
