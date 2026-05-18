import { runtimeGetJson, runtimePostJson } from "@/lib/api/client";
import { RuntimeApiError } from "@/lib/api/runtime-errors";
import {
  buildUnsupportedStrategyBundle,
  mapApiStrategyBundle,
} from "@/lib/runtime/strategy/strategy-adapters";
import type { StrategyBundleDto } from "@/lib/runtime/strategy/strategy-types";
import {
  formatRunReadModelConflictReason,
  isRunReadModelConflictError,
} from "@/lib/runtime/run-read-model-http";

const STRATEGY_POST_TIMEOUT_MS = 120_000;

export async function fetchStrategyBundle(
  runKey: string,
): Promise<StrategyBundleDto> {
  try {
    const enc = encodeURIComponent(runKey);
    const j = await runtimeGetJson<{ ok?: boolean; data?: unknown }>(
      `/runs/${enc}/strategy`,
      { timeoutMs: 12_000 },
    );
    const mapped = mapApiStrategyBundle(
      j as Parameters<typeof mapApiStrategyBundle>[0],
      runKey,
    );
    if (mapped) return mapped;
    return buildUnsupportedStrategyBundle(
      runKey,
      "Resposta strategy sem dados válidos (contrato).",
    );
  } catch (e) {
    if (e instanceof RuntimeApiError && e.code === "http" && e.status === 404) {
      return buildUnsupportedStrategyBundle(
        runKey,
        "Strategy read-model indisponível (HTTP 404).",
      );
    }
    if (isRunReadModelConflictError(e)) {
      return buildUnsupportedStrategyBundle(
        runKey,
        formatRunReadModelConflictReason(e, "estratégia"),
      );
    }
    throw e;
  }
}

export async function postStrategyRun(
  runKey: string,
  opts?: { force?: boolean },
): Promise<{ skipped?: boolean; strategySummary?: unknown }> {
  const enc = encodeURIComponent(runKey);
  const j = await runtimePostJson<{
    ok?: boolean;
    data?: { skipped?: boolean; strategySummary?: unknown };
  }>(`/runs/${enc}/strategy`, { force: opts?.force === true }, {
    timeoutMs: STRATEGY_POST_TIMEOUT_MS,
  });
  return {
    skipped: Boolean(j.data?.skipped),
    strategySummary: j.data?.strategySummary,
  };
}
