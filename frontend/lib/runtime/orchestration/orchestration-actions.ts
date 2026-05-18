import { runtimePostJson } from "@/lib/api/client";
import { RuntimeApiError } from "@/lib/api/runtime-errors";
import {
  mapApiExecuteResponse,
  parseExecuteErrorMessage,
} from "@/lib/runtime/orchestration/orchestration-adapters";
import type {
  ExecuteRunResult,
  OrchestrationBootstrapDto,
} from "@/lib/runtime/orchestration/orchestration-types";

const EXECUTE_TIMEOUT_MS = 30_000;

type ExecuteJson = Parameters<typeof mapApiExecuteResponse>[0];

export async function postExecuteRun(
  runKey: string,
  opts?: { force?: boolean },
): Promise<ExecuteRunResult> {
  const enc = encodeURIComponent(runKey);
  try {
    const j = await runtimePostJson<ExecuteJson>(
      `/runs/${enc}/execute`,
      opts?.force ? { force: true } : {},
      { timeoutMs: EXECUTE_TIMEOUT_MS },
    );
    const data = mapApiExecuteResponse(j, runKey);
    if (!data) {
      return {
        ok: false,
        message: parseExecuteErrorMessage(j, "Execute falhou."),
        data: null,
      };
    }
    return {
      ok: true,
      message: "Execução disparada.",
      data,
    };
  } catch (e) {
    if (e instanceof RuntimeApiError) {
      return {
        ok: false,
        message: e.message || "Execute rejeitado.",
        data: null,
      };
    }
    throw e;
  }
}

export function mockExecuteBootstrap(runKey: string): OrchestrationBootstrapDto {
  const now = new Date().toISOString();
  return {
    runId: runKey,
    jobId: `mock-exec-${runKey.slice(-6)}`,
    executionState: "execution_starting",
    orchestrationState: "execution_starting",
    startedAt: now,
    workerId: "mock-worker-1",
    currentPhase: "execution",
    idempotent: false,
  };
}
