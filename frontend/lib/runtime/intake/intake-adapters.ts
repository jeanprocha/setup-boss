import type { CreateRunResultDto, IntakeUiPhase } from "@/lib/runtime/intake/intake-types";
import {
  parseStructuredPreRunError,
  type StructuredPreRunError,
} from "@/lib/runtime/intake/pre-run-error";

type ApiJson = {
  ok?: boolean;
  data?: Record<string, unknown>;
  error?: Record<string, unknown>;
};

export type { StructuredPreRunError };
export { parseStructuredPreRunError };

const INTAKE_PHASES: IntakeUiPhase[] = [
  "idle",
  "creating_run",
  "intake_running",
  "clarification_required",
  "clarification_ready",
  "strategy_pending",
  "failed",
];

function str(v: unknown): string {
  return v != null ? String(v) : "";
}

function mapInitialState(raw: unknown): IntakeUiPhase {
  const k = str(raw).trim() as IntakeUiPhase;
  if (INTAKE_PHASES.includes(k)) return k;
  if (k === "clarification_required") return "clarification_required";
  return "intake_running";
}

export function mapApiCreateRunResult(json: ApiJson): CreateRunResultDto | null {
  if (!json.ok || !json.data) return null;
  const d = json.data;
  return {
    runId: str(d.runId),
    jobId: str(d.jobId),
    initialState: mapInitialState(d.initialState),
    clarificationRequired: Boolean(d.clarificationRequired),
    createdAt: str(d.createdAt) || new Date().toISOString(),
    phase2Status: d.phase2Status != null ? str(d.phase2Status) : null,
    classification: d.classification != null ? str(d.classification) : null,
    uiPhase: d.uiPhase != null ? str(d.uiPhase) : null,
    uiState: d.uiState != null ? str(d.uiState) : null,
  };
}

const KNOWLEDGE_ERROR_CODES = new Set([
  "KNOWLEDGE_BASE_MISSING",
  "KNOWLEDGE_BASE_UNTRACKED",
  "KNOWLEDGE_BASE_IGNORED",
  "KNOWLEDGE_BASE_NOT_GIT",
  "KNOWLEDGE_BASE_WRONG_PATH",
  "KNOWLEDGE_BASE_INVALID_SEED",
  "KNOWLEDGE_BASE_INVALID_STRUCTURE",
  "KNOWLEDGE_BASE_BOOTSTRAP_OWNERSHIP_VIOLATION",
  "KNOWLEDGE_BASE_STRUCTURAL_DRIFT",
  "KNOWLEDGE_BASE_VERSION_MISSING",
  "KNOWLEDGE_BASE_VERSION_INVALID",
  "KNOWLEDGE_BASE_UNSUPPORTED_VERSION",
  "KNOWLEDGE_BASE_SENSITIVE_DATA",
  "KNOWLEDGE_BASE_LANGUAGE_WARNING",
  "PROJECT_ROOT_UNRESOLVED",
]);

export function createRunErrorMessage(json: ApiJson, fallback: string): string {
  const structured = parseStructuredPreRunError(json.error);
  if (structured) {
    if (structured.description?.trim()) return structured.description.trim();
    if (structured.title?.trim()) return structured.title.trim();
    return structured.message;
  }
  const code =
    json.error?.code != null ? String(json.error.code).trim() : "";
  if (code && KNOWLEDGE_ERROR_CODES.has(code)) {
    const desc =
      typeof json.error?.description === "string"
        ? json.error.description
        : null;
    const msg =
      typeof json.error?.message === "string" ? json.error.message : null;
    return desc || msg || fallback;
  }
  const msg =
    typeof json.error?.message === "string" ? json.error.message : null;
  return msg || fallback;
}
