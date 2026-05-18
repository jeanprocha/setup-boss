import { runtimeGetJson } from "@/lib/api/client";
import {
  mapApiRecoverySnapshot,
  mapApiExecuteResponse,
} from "@/lib/runtime/orchestration/orchestration-adapters";
import type {
  OrchestrationBootstrapDto,
  RuntimeRecoverySnapshotDto,
} from "@/lib/runtime/orchestration/orchestration-types";

export async function fetchRuntimeRecoverySnapshot(): Promise<RuntimeRecoverySnapshotDto | null> {
  const j = await runtimeGetJson<{ ok?: boolean; data?: Record<string, unknown> }>(
    "/runtime/recovery",
    { timeoutMs: 12_000 },
  );
  return mapApiRecoverySnapshot(j ?? {});
}

export async function fetchRunOrchestrationBootstrap(
  runKey: string,
): Promise<OrchestrationBootstrapDto | null> {
  const enc = encodeURIComponent(runKey);
  const j = await runtimeGetJson<{ ok?: boolean; data?: Record<string, unknown> }>(
    `/runs/${enc}/orchestration`,
    { timeoutMs: 12_000 },
  );
  return mapApiExecuteResponse(
    { ok: j?.ok, data: j?.data as Parameters<typeof mapApiExecuteResponse>[0]["data"] },
    runKey,
  );
}
