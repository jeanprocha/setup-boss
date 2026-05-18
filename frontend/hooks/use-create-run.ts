"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { runtimeQueryKeys } from "@/lib/api/query-keys";
import { RuntimeApiError, isRuntimeApiError } from "@/lib/api/runtime-errors";
import { intakeInlineBody } from "@/lib/runtime/intake/pre-run-error";
import type { ProjectSummaryDto } from "@/lib/api/runtime-types";
import { createRunFromTask } from "@/lib/runtime/intake/intake-actions";
import type { CreateRunPayload } from "@/lib/runtime/intake/intake-types";
import {
  isProjectInRegistry,
  isProjectNotFoundMessage,
} from "@/lib/runtime/intake/project-registry-validation";
import { shouldOpenClarificationTab } from "@/lib/runtime/intake/intake-state";
import { useIntakeStore } from "@/stores/intake-store";
import { seedIntakeAuditForRun } from "@/stores/intake-audit-store";
import { useMissionShellStore } from "@/stores/mission-shell-store";
import { useRuntimeConnectionStore } from "@/stores/runtime-connection-store";
import { logIntakeStartFailure } from "@/stores/ui-diagnostics-store";
import {
  buildIntakeTimeoutStructuredError,
  intakeTimeoutBody,
  isIntakeTimeoutError,
} from "@/lib/runtime/intake/intake-timeout-error";
import { useI18n } from "@/lib/i18n/use-i18n";
import type { ProjectsQueryResult } from "@/hooks/use-projects";
import { resolveCanonicalRunKey } from "@/lib/runtime/intake/resolve-canonical-run-key";
import { seedProjectRunAfterCreate } from "@/lib/runtime/intake/seed-project-run-after-create";

function resolveProjectsFromCache(
  queryClient: ReturnType<typeof useQueryClient>,
): ProjectSummaryDto[] {
  const rows = queryClient.getQueriesData<ProjectsQueryResult>({
    queryKey: runtimeQueryKeys.projects(),
  });
  for (const [, data] of rows) {
    if (data?.projects?.length) return data.projects;
  }
  return [];
}

export function useCreateRun() {
  const { t } = useI18n();
  const qc = useQueryClient();
  const setUiPhase = useIntakeStore((s) => s.setUiPhase);
  const setLastError = useIntakeStore((s) => s.setLastError);
  const setLastPreRunError = useIntakeStore((s) => s.setLastPreRunError);
  const pushRecentHint = useIntakeStore((s) => s.pushRecentHint);
  const rememberTaskForRun = useIntakeStore((s) => s.rememberTaskForRun);
  const requestClarificationBootstrap = useIntakeStore(
    (s) => s.requestClarificationBootstrap,
  );
  const commitNewActivityRun = useMissionShellStore(
    (s) => s.commitNewActivityRun,
  );

  const reachable = useRuntimeConnectionStore((s) => s.connection.reachable);

  return useMutation({
    retry: false,
    onMutate: () => {
      setUiPhase("creating_run");
      setLastError(null);
      setLastPreRunError(null);
    },
    mutationFn: async (payload: CreateRunPayload) => {
      if (!payload.projectId) {
        throw new RuntimeApiError(
          t("taskIntake.selectRegisteredProject"),
          "network",
        );
      }
      if (!reachable) {
        throw new RuntimeApiError(
          t("taskIntake.runtimeOfflineDraft"),
          "network",
        );
      }

      const shellProjectId =
        useMissionShellStore.getState().selectedProjectId;
      const registry = resolveProjectsFromCache(qc);
      if (
        registry.length > 0 &&
        !isProjectInRegistry(payload.projectId, registry)
      ) {
        logIntakeStartFailure({
          projectId: payload.projectId,
          selectedProjectId: shellProjectId,
          endpoint: "POST /runs",
          status: 0,
          apiMessage: "projectId not in GET /projects cache",
          phase: "preflight",
          preRun: null,
        });
        throw new RuntimeApiError(t("taskIntake.projectUnavailable"), "contract");
      }

      return createRunFromTask(payload);
    },
    onSuccess: async (result, variables) => {
      const runKey = result.runId?.trim() || result.jobId?.trim() || "";
      const shellProjectId =
        useMissionShellStore.getState().selectedProjectId;

      if (!runKey) {
        setUiPhase("idle");
        setLastError(t("taskIntake.createRunFailed"));
        logIntakeStartFailure({
          projectId: variables.projectId,
          selectedProjectId: shellProjectId,
          endpoint: "POST /runs",
          status: 200,
          apiMessage: "Resposta sem runId/jobId",
          phase: "api",
          preRun: null,
        });
        return;
      }

      const selectionKey = seedProjectRunAfterCreate(
        qc,
        variables.projectId,
        result,
        variables.task,
      );
      commitNewActivityRun(variables.projectId, selectionKey);

      setUiPhase(result.initialState);
      pushRecentHint(variables.task);
      rememberTaskForRun(selectionKey, variables.task);

      seedIntakeAuditForRun(
        selectionKey,
        result.initialState,
        result.clarificationRequired,
      );
      if (
        shouldOpenClarificationTab(
          result.clarificationRequired,
          result.initialState,
        )
      ) {
        requestClarificationBootstrap(selectionKey);
      }

      void qc
        .refetchQueries({
          predicate: (q) => {
            const k = q.queryKey;
            return (
              Array.isArray(k) &&
              k[0] === "runtime" &&
              k[1] === "projectRuns" &&
              k[2] === variables.projectId
            );
          },
        })
        .then(() => {
          const canonical = resolveCanonicalRunKey(
            qc,
            variables.projectId,
            runKey,
          );
          if (
            canonical &&
            canonical !== useMissionShellStore.getState().selectedRunId
          ) {
            useMissionShellStore.getState().setSelectedRun(canonical);
          }
        });

      void qc.invalidateQueries({ queryKey: runtimeQueryKeys.root });
    },
    onError: (e, variables) => {
      setUiPhase("idle");
      const shellProjectId =
        useMissionShellStore.getState().selectedProjectId;
      const structured =
        isRuntimeApiError(e) && e.structured ? e.structured : null;
      const rawMsg =
        e instanceof RuntimeApiError
          ? e.message
          : e instanceof Error
            ? e.message
            : t("taskIntake.createRunFailed");

      const timeoutErr = isIntakeTimeoutError(e)
        ? buildIntakeTimeoutStructuredError({
            projectId: variables.projectId,
            selectedProjectId: shellProjectId,
            endpoint: "POST /runs",
            method: "POST",
            timeoutMs: 125_000,
            rawMessage: rawMsg,
          })
        : null;

      const projectNotFound =
        e instanceof RuntimeApiError &&
        (structured?.code === "project_not_found" ||
          isProjectNotFoundMessage(rawMsg) ||
          (e.status === 404 && /projeto|project/i.test(rawMsg)));

      const httpStatus =
        e instanceof RuntimeApiError && e.status > 0 ? e.status : 0;
      logIntakeStartFailure({
        projectId: variables.projectId,
        selectedProjectId: shellProjectId,
        endpoint: "POST /runs",
        status: httpStatus,
        apiMessage: rawMsg,
        phase: timeoutErr ? "submit" : projectNotFound || httpStatus > 0 ? "api" : "preflight",
        preRun: timeoutErr ?? structured,
        timeoutMs: timeoutErr ? 125_000 : undefined,
      });

      if (projectNotFound) {
        setLastPreRunError(null);
        setLastError(t("taskIntake.projectUnavailable"));
        return;
      }

      if (timeoutErr) {
        setLastPreRunError(timeoutErr);
        setLastError(intakeTimeoutBody());
        return;
      }

      if (structured) {
        setLastPreRunError(structured);
        setLastError(intakeInlineBody(structured));
        return;
      }

      setLastPreRunError(null);
      setLastError(rawMsg);
    },
  });
}
