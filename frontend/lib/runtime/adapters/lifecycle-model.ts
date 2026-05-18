import type { RuntimeUiState } from "@/lib/runtime/runtime-ui-types";
import {
  LIFECYCLE_PHASE_IDS,
  type LifecyclePhaseId,
  mapRawPhaseToLifecycleId,
} from "@/lib/runtime/adapters/runtime-labels";

export type LifecycleStepStatus = "pending" | "active" | "done" | "blocked";

export type LifecycleStepVm = {
  id: LifecyclePhaseId;
  status: LifecycleStepStatus;
  /** progresso ilustrativo 0–1 dentro do passo */
  progress: number;
  /** texto curto para timestamp (último evento ou —) */
  timestampLabel: string | null;
};

const orderIndex = (id: LifecyclePhaseId) =>
  LIFECYCLE_PHASE_IDS.indexOf(id);

/**
 * Deriva passos do lifecycle a partir da fase actual e do estado da UI.
 * Sem DAG: sequência fixa com um passo marcado como activo.
 */
export function buildLifecycleSteps(
  currentPhaseRaw: string,
  state: RuntimeUiState,
  lastPhaseEventTime: string | null,
): LifecycleStepVm[] {
  const activeId = mapRawPhaseToLifecycleId(currentPhaseRaw);
  const idx = orderIndex(activeId);
  const terminalFail = state === "failed";
  const fullSuccess = state === "success";

  if (fullSuccess) {
    return LIFECYCLE_PHASE_IDS.map((id, i) => ({
      id,
      status: "done" as const,
      progress: 1,
      timestampLabel:
        i === LIFECYCLE_PHASE_IDS.length - 1 ? lastPhaseEventTime : null,
    }));
  }

  return LIFECYCLE_PHASE_IDS.map((id, i) => {
    let status: LifecycleStepStatus = "pending";
    let progress = 0;

    if (i < idx) {
      status = "done";
      progress = 1;
    } else if (i === idx) {
      if (id === "completed" && terminalFail) {
        status = "blocked";
        progress = 1;
      } else if (terminalFail && id === activeId) {
        status = "blocked";
        progress = 0.4;
      } else if (state === "blocked" && id === activeId) {
        status = "blocked";
        progress = 0.4;
      } else {
        status = "active";
        progress =
          state === "running" ||
          state === "retrying" ||
          state === "correcting"
            ? 0.55
            : state === "recovered" || state === "warning"
              ? 0.85
              : 0.35;
      }
    }

    const timestampLabel =
      i === idx && lastPhaseEventTime ? lastPhaseEventTime : null;

    return { id, status, progress, timestampLabel };
  });
}
