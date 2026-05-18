import { mapJobStatusToUiState } from "./map-status.ts";
import type { RuntimeUiState } from "../runtime-ui-types.ts";

/** Chaves `workflow.*` suportadas para rótulo na sidebar (P1c). */
export type WorkflowStatusKey =
  | "clarification_pending"
  | "awaiting_approval"
  | "strategy_pending"
  | "ready_for_execution"
  | "execution_running"
  | "review_running"
  | "completed"
  | "failed"
  | "blocked";

export type HonestRunDisplay = {
  state: RuntimeUiState;
  operationalStatusKey: WorkflowStatusKey | null;
};

const VALID_UI_STATES = new Set<RuntimeUiState>([
  "running",
  "waiting_clarification_questions",
  "waiting_clarification_answers",
  "waiting_approval",
  "blocked",
  "failed",
  "correcting",
  "retrying",
  "recovered",
  "success",
  "warning",
]);

const TERMINAL_ORCHESTRATION = new Set([
  "execution_completed",
  "execution_failed",
  "execution_blocked",
]);

const ACTIVE_ORCHESTRATION = new Set([
  "queued",
  "execution_starting",
  "execution_running",
  "execution_reviewing",
  "execution_correcting",
  "execution_recovering",
]);

function metaString(
  meta: Record<string, unknown> | null,
  ...keys: string[]
): string {
  if (!meta) return "";
  for (const key of keys) {
    const v = meta[key];
    if (typeof v === "string" && v.trim()) return v.trim();
  }
  return "";
}

function parseUiState(raw: string): RuntimeUiState | null {
  const k = raw.trim().toLowerCase();
  if (VALID_UI_STATES.has(k as RuntimeUiState)) return k as RuntimeUiState;
  return null;
}

function workflowFromInitialState(initialState: string): WorkflowStatusKey | null {
  switch (initialState) {
    case "clarification_required":
      return "clarification_pending";
    case "clarification_ready":
      return "awaiting_approval";
    case "strategy_pending":
      return "strategy_pending";
    case "ready_for_execution":
      return "ready_for_execution";
    case "failed":
      return "failed";
    default:
      return null;
  }
}

function workflowFromOrchestration(
  orchestrationState: string,
): WorkflowStatusKey | null {
  if (orchestrationState === "execution_completed") return "completed";
  if (orchestrationState === "execution_failed") return "failed";
  if (orchestrationState === "execution_blocked") return "blocked";
  if (
    orchestrationState === "execution_running" ||
    orchestrationState === "execution_starting" ||
    orchestrationState === "queued"
  ) {
    return "execution_running";
  }
  if (orchestrationState === "execution_reviewing") return "review_running";
  if (
    orchestrationState === "execution_correcting" ||
    orchestrationState === "execution_recovering"
  ) {
    return "execution_running";
  }
  if (orchestrationState === "ready_for_execution") return "ready_for_execution";
  return null;
}

function stateFromWorkflowKey(
  key: WorkflowStatusKey,
): RuntimeUiState {
  switch (key) {
    case "clarification_pending":
      return "waiting_clarification_answers";
    case "awaiting_approval":
      return "waiting_approval";
    case "strategy_pending":
    case "ready_for_execution":
    case "blocked":
      return "blocked";
    case "execution_running":
    case "review_running":
      return "running";
    case "completed":
      return "success";
    case "failed":
      return "failed";
    default:
      return "blocked";
  }
}

/**
 * Deriva estado visual + chave i18n a partir do job da fila e metadata da missão.
 * Job `completed` na fila ≠ missão concluída (P1c).
 */
export function deriveHonestRunDisplay(
  jobStatus: string,
  metadata: Record<string, unknown> | null | undefined,
): HonestRunDisplay {
  const status = String(jobStatus || "").toLowerCase();
  const meta =
    metadata && typeof metadata === "object" && !Array.isArray(metadata)
      ? metadata
      : null;

  const initialState = metaString(meta, "initialState", "initial_state");
  const orchestrationState = metaString(
    meta,
    "orchestrationState",
    "orchestration_state",
  );
  const uiPhase = metaString(meta, "uiPhase", "ui_phase").toLowerCase();
  const uiStateRaw = metaString(meta, "uiState", "ui_state").toLowerCase();

  if (status === "running" || status === "pending") {
    return {
      state: mapJobStatusToUiState(status),
      operationalStatusKey: status === "running" ? "execution_running" : null,
    };
  }

  if (status === "failed") {
    return { state: "failed", operationalStatusKey: "failed" };
  }

  if (status === "cancelled" || status === "cancelling") {
    return { state: "warning", operationalStatusKey: null };
  }

  const wfOrch = workflowFromOrchestration(orchestrationState);
  if (orchestrationState && TERMINAL_ORCHESTRATION.has(orchestrationState) && wfOrch) {
    return {
      state: stateFromWorkflowKey(wfOrch),
      operationalStatusKey: wfOrch,
    };
  }

  if (orchestrationState && ACTIVE_ORCHESTRATION.has(orchestrationState) && wfOrch) {
    return {
      state: stateFromWorkflowKey(wfOrch),
      operationalStatusKey: wfOrch,
    };
  }

  const parsedUi = uiStateRaw ? parseUiState(uiStateRaw) : null;
  const uiStateIsTerminalHint =
    uiStateRaw === "success" ||
    uiStateRaw === "completed" ||
    uiStateRaw === "recovered";

  if (parsedUi && !uiStateIsTerminalHint) {
    const wfInitial = workflowFromInitialState(initialState);
    return {
      state: parsedUi,
      operationalStatusKey: wfInitial,
    };
  }

  const wfInitial = workflowFromInitialState(initialState);
  if (wfInitial && wfInitial !== "completed") {
    return {
      state: stateFromWorkflowKey(wfInitial),
      operationalStatusKey: wfInitial,
    };
  }

  if (uiPhase === "clarify") {
    return {
      state: "waiting_clarification_answers",
      operationalStatusKey: "clarification_pending",
    };
  }
  if (uiPhase === "strategy") {
    return {
      state: "blocked",
      operationalStatusKey: "strategy_pending",
    };
  }
  if (uiPhase === "intake") {
    return { state: "running", operationalStatusKey: null };
  }

  if (status === "completed") {
    if (uiPhase === "done" && metaString(meta, "source") === "run-index") {
      return { state: "success", operationalStatusKey: "completed" };
    }

    if (uiStateIsTerminalHint && orchestrationState === "execution_completed") {
      return { state: "success", operationalStatusKey: "completed" };
    }

    if (initialState || uiPhase) {
      return {
        state: "blocked",
        operationalStatusKey: wfInitial ?? "blocked",
      };
    }
  }

  if (parsedUi) {
    return { state: parsedUi, operationalStatusKey: wfOrch ?? wfInitial };
  }

  return {
    state: mapJobStatusToUiState(status),
    operationalStatusKey: null,
  };
}
