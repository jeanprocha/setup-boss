"use client";

import { useQuery } from "@tanstack/react-query";
import { runtimeQueryKeys } from "@/lib/api/query-keys";
import { fetchRunEvidence } from "@/lib/api/runtime-api";
import { RuntimeApiError } from "@/lib/api/runtime-errors";
import { useRunSummary } from "@/hooks/use-run-summary";
import { resolvedRunFetchKey } from "@/lib/runtime/run-selection";
import { useRuns } from "@/hooks/use-runs";
import type { RunEvidenceBundle } from "@/lib/runtime/evidence-types";
import { mapRunEvidenceDtoToBundle } from "@/lib/runtime/adapters/map-evidence";
import { useRuntimeConnectionStore } from "@/stores/runtime-connection-store";
import { useMissionLocaleStore } from "@/stores/mission-locale-store";
import { translate } from "@/lib/i18n/translate";
import { isRunReadModelNotFoundError } from "@/lib/runtime/run-read-model-http";
import { messageCatalog } from "@/locales/registry";

export type EvidenceSource = "api" | "empty" | "degraded";

export type RunEvidenceHookResult = {
  bundle: RunEvidenceBundle;
  evidenceSource: EvidenceSource;
  runsSource: "runtime" | "offline" | "error";
  isLoading: boolean;
  isError: boolean;
  /** Chave efectiva enviada à API (runId ou job id) */
  evidenceKey: string | null;
};

function missionMessages() {
  const loc = useMissionLocaleStore.getState().locale;
  return messageCatalog[loc] as Record<string, unknown>;
}

const EMPTY_BUNDLE = (runId: string): RunEvidenceBundle => ({
  runId,
  artifacts: [],
  diagnostics: [],
  integrity: null,
  consoleLines: [
    translate(missionMessages(), "artifacts.emptyBundleConsoleLine"),
  ],
  isSynthetic: false,
  truncatedListing: false,
});

export function useRunEvidence(
  projectId: string | null,
  runId: string | null,
): RunEvidenceHookResult {
  const rq = useRuns(projectId);
  const summary = useRunSummary(projectId, runId);
  const reachable = useRuntimeConnectionStore((s) => s.connection.reachable);

  const runsSource = rq.data?.source ?? "offline";
  const rid = runId ?? "—";

  const evidenceKey = resolvedRunFetchKey(summary, runId);

  const apiQ = useQuery({
    queryKey: [
      ...runtimeQueryKeys.runEvidence(evidenceKey),
      { reachable, runsSource },
    ],
    queryFn: async () => {
      if (!evidenceKey) return null;
      return fetchRunEvidence(evidenceKey);
    },
    enabled: Boolean(evidenceKey) && reachable,
    staleTime: 20_000,
    retry: (failureCount, error) =>
      !isRunReadModelNotFoundError(error) && failureCount < 1,
  });

  if (!reachable || !evidenceKey) {
    return {
      bundle: EMPTY_BUNDLE(rid),
      evidenceSource: reachable ? "empty" : "degraded",
      runsSource,
      isLoading: false,
      isError: false,
      evidenceKey,
    };
  }

  if (apiQ.isLoading) {
    return {
      bundle: {
        ...EMPTY_BUNDLE(rid),
        consoleLines: [
          translate(missionMessages(), "artifacts.consoleLoadingLine"),
        ],
      },
      evidenceSource: "api",
      runsSource,
      isLoading: true,
      isError: false,
      evidenceKey,
    };
  }

  if (apiQ.isError) {
    const degraded =
      apiQ.error instanceof RuntimeApiError &&
      (apiQ.error.code === "network" || apiQ.error.code === "timeout");
    return {
      bundle: EMPTY_BUNDLE(rid),
      evidenceSource: degraded ? "degraded" : "empty",
      runsSource,
      isLoading: false,
      isError: true,
      evidenceKey,
    };
  }

  if (!apiQ.data) {
    return {
      bundle: EMPTY_BUNDLE(rid),
      evidenceSource: "empty",
      runsSource,
      isLoading: false,
      isError: false,
      evidenceKey,
    };
  }

  const hasAny =
    apiQ.data.artifacts.length > 0 ||
    apiQ.data.diagnostics.length > 0 ||
    apiQ.data.integrity != null;

  return {
    bundle: mapRunEvidenceDtoToBundle(apiQ.data),
    evidenceSource: hasAny ? "api" : "empty",
    runsSource,
    isLoading: false,
    isError: false,
    evidenceKey,
  };
}
