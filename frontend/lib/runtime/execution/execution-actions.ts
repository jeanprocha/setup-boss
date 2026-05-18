import { runtimeGetJson } from "@/lib/api/client";
import { RuntimeApiError } from "@/lib/api/runtime-errors";
import {
  buildUnsupportedExecutionBundle,
  mapApiExecutionBundle,
} from "@/lib/runtime/execution/execution-adapters";
import type { ExecutionBundleDto } from "@/lib/runtime/execution/execution-types";
import { mockExecutionUnsupported } from "@/lib/mocks/execution";
import {
  formatRunReadModelConflictReason,
  isRunReadModelConflictError,
} from "@/lib/runtime/run-read-model-http";

export async function fetchExecutionBundle(
  runKey: string,
): Promise<ExecutionBundleDto> {
  try {
    const enc = encodeURIComponent(runKey);
    const j = await runtimeGetJson<{ ok?: boolean; data?: unknown }>(
      `/runs/${enc}/execution`,
      { timeoutMs: 12_000 },
    );
    const mapped = mapApiExecutionBundle(
      j as Parameters<typeof mapApiExecutionBundle>[0],
      runKey,
    );
    if (mapped) return mapped;
  } catch (e) {
    if (e instanceof RuntimeApiError && e.code === "http" && e.status === 404) {
      return mockExecutionUnsupported(runKey);
    }
    if (isRunReadModelConflictError(e)) {
      return buildUnsupportedExecutionBundle(
        runKey,
        formatRunReadModelConflictReason(e, "execução"),
      );
    }
    throw e;
  }

  return mockExecutionUnsupported(runKey);
}
