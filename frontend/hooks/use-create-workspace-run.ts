"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { runtimeQueryKeys } from "@/lib/api/query-keys";
import { RuntimeApiError } from "@/lib/api/runtime-errors";
import {
  postWorkspaceRun,
  patchWorkspaceRun,
  formatWorkspaceValidationMessage,
} from "@/lib/api/workspace-runtime-api";
import type { ProjectSummaryDto } from "@/lib/api/runtime-types";
import {
  buildWorkspaceGlobalSpec,
  titleFromWorkspaceTask,
} from "@/lib/workspace/workspace-global-spec";
import { mergePlanningIntoGlobalSpec } from "@/lib/workspace/workspace-run-lifecycle";
import { createRunFromTask } from "@/lib/runtime/intake/intake-actions";
import { shouldOpenClarificationTab } from "@/lib/runtime/intake/intake-state";
import type { IntakeUiPhase } from "@/lib/runtime/intake/intake-types";
import { seedProjectRunAfterCreate } from "@/lib/runtime/intake/seed-project-run-after-create";
import { resolveCanonicalRunKey } from "@/lib/runtime/intake/resolve-canonical-run-key";
import { useIntakeStore } from "@/stores/intake-store";
import { seedIntakeAuditForRun } from "@/stores/intake-audit-store";
import { useMissionShellStore } from "@/stores/mission-shell-store";
import { useRuntimeConnectionStore } from "@/stores/runtime-connection-store";
import { useI18n } from "@/lib/i18n/use-i18n";
import type { WorkspaceRunDto } from "@/lib/api/workspace-run-types";

export type CreateWorkspaceRunVariables = {
  workspaceId: string;
  task: string;
  projectIds: string[];
  projectsCatalog: ProjectSummaryDto[];
};

export type CreateWorkspaceRunResult = {
  workspaceRun: WorkspaceRunDto;
  planningProjectId: string;
  planningRunKey: string;
  initialState: IntakeUiPhase;
  clarificationRequired: boolean;
};

export function useCreateWorkspaceRun() {
  const { t } = useI18n();
  const qc = useQueryClient();
  const reachable = useRuntimeConnectionStore((s) => s.connection.reachable);
  const setUiPhase = useIntakeStore((s) => s.setUiPhase);
  const setLastError = useIntakeStore((s) => s.setLastError);
  const setLastPreRunError = useIntakeStore((s) => s.setLastPreRunError);
  const pushRecentHint = useIntakeStore((s) => s.pushRecentHint);
  const rememberTaskForRun = useIntakeStore((s) => s.rememberTaskForRun);
  const requestClarificationBootstrap = useIntakeStore(
    (s) => s.requestClarificationBootstrap,
  );
  const commitNewActivityWorkspaceRun = useMissionShellStore(
    (s) => s.commitNewActivityWorkspaceRun,
  );

  return useMutation({
    retry: false,
    onMutate: () => {
      setUiPhase("creating_run");
      setLastError(null);
      setLastPreRunError(null);
    },
    mutationFn: async (
      variables: CreateWorkspaceRunVariables,
    ): Promise<CreateWorkspaceRunResult> => {
      if (!variables.workspaceId) {
        throw new RuntimeApiError(
          t("workspaceRun.selectWorkspace"),
          "network",
        );
      }
      if (!reachable) {
        throw new RuntimeApiError(t("taskIntake.runtimeOfflineDraft"), "network");
      }
      if (!variables.projectIds.length) {
        throw new RuntimeApiError(t("workspaceRun.noProjectsInWorkspace"), "contract");
      }

      const task = variables.task.trim();
      const planningProjectId = variables.projectIds[0]!;
      const globalSpec = buildWorkspaceGlobalSpec({
        task,
        projectIds: variables.projectIds,
        source: "mission_control",
        priority: "normal",
      });

      const workspaceRun = await postWorkspaceRun({
        workspaceId: variables.workspaceId,
        title: titleFromWorkspaceTask(task),
        description: null,
        status: "draft",
        globalSpec,
      });

      const planningResult = await createRunFromTask({
        projectId: planningProjectId,
        task,
        metadata: {
          source: "mission_control_workspace",
          workspaceRunId: workspaceRun.workspaceRunId,
          workspaceId: variables.workspaceId,
          workspaceProjectIds: variables.projectIds,
          tags: [`workspace:${variables.workspaceId}`],
        },
      });

      const planningRunKey = seedProjectRunAfterCreate(
        qc,
        planningProjectId,
        planningResult,
        task,
      );

      const specWithPlanning = mergePlanningIntoGlobalSpec(globalSpec, {
        projectId: planningProjectId,
        runId: planningResult.runId,
      });

      const patched = await patchWorkspaceRun(workspaceRun.workspaceRunId, {
        globalSpec: specWithPlanning,
      });

      return {
        workspaceRun: patched,
        planningProjectId,
        planningRunKey,
        initialState: planningResult.initialState,
        clarificationRequired: planningResult.clarificationRequired,
      };
    },
    onSuccess: async (result, variables) => {
      const {
        workspaceRun,
        planningProjectId,
        planningRunKey,
        initialState,
        clarificationRequired,
      } = result;

      setUiPhase(initialState);
      pushRecentHint(variables.task);
      rememberTaskForRun(planningRunKey, variables.task);

      commitNewActivityWorkspaceRun(variables.workspaceId, workspaceRun.workspaceRunId, {
        projectId: planningProjectId,
        runId: planningRunKey,
      });

      seedIntakeAuditForRun(
        planningRunKey,
        initialState,
        clarificationRequired,
      );
      if (shouldOpenClarificationTab(clarificationRequired, initialState)) {
        requestClarificationBootstrap(planningRunKey);
      }

      void qc
        .refetchQueries({
          predicate: (q) => {
            const k = q.queryKey;
            return (
              Array.isArray(k) &&
              k[0] === "runtime" &&
              k[1] === "projectRuns" &&
              k[2] === planningProjectId
            );
          },
        })
        .then(() => {
          const canonical = resolveCanonicalRunKey(
            qc,
            planningProjectId,
            planningRunKey,
          );
          if (
            canonical &&
            canonical !== useMissionShellStore.getState().selectedRunId
          ) {
            useMissionShellStore
              .getState()
              .commitNewActivityWorkspaceRun(
                variables.workspaceId,
                workspaceRun.workspaceRunId,
                { projectId: planningProjectId, runId: canonical },
              );
          }
        });

      await qc.invalidateQueries({ queryKey: runtimeQueryKeys.root });
    },
    onError: (e) => {
      setUiPhase("failed");
      const msg = formatWorkspaceValidationMessage(
        e,
        t("workspaceRun.createFailed"),
      );
      setLastError(msg);
    },
  });
}
