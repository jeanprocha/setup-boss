import type { ExecutionStepCategory, ExecutionStepId } from "@/lib/runtime/execution/execution-step-catalog";
import type { OperationalStepStatus } from "@/lib/runtime/execution/operational-step-status";
import type { SemanticWorkflowPhaseId } from "@/lib/runtime/execution/semantic-workflow-phase-id";
import type {
  RuntimeActionKind,
  RuntimeActionTarget,
} from "@/lib/runtime/navigation/runtime-action-target";

export type ClarificationQaPair = {
  question: string;
  answer: string;
  status?: string;
};

export type SemanticSubstepLine = {
  label: string;
  detail: string;
  status: OperationalStepStatus;
};

export type ExecutionStepSurfaceStatus =
  | "pending"
  | "active"
  | "done"
  | "blocked";

export type ExecutionTimelineCardHighlight = {
  label: string;
  value: string;
  tone?: "default" | "warn" | "error" | "success";
};

export type ExecutionTimelineCardAction = {
  id: string;
  label: string;
  intent:
    | "approve"
    | "reject"
    | "open"
    | "custom"
    | "navigate"
    | "strategy_kickoff";
  disabled?: boolean;
  navigation?: {
    target: RuntimeActionTarget;
    actionKind: RuntimeActionKind;
  };
};

export type ExecutionTimelineSectionKind =
  | "text"
  | "markdown"
  | "keyValue"
  | "list"
  | "checklist"
  | "fileList"
  | "logPreview"
  | "warning"
  | "error"
  | "actionRequired"
  | "metrics"
  | "clarificationQa"
  | "semanticSubsteps";

export type ExecutionTimelineCardSection = {
  title: string;
  kind: ExecutionTimelineSectionKind;
  /** texto corrido ou markdown curto */
  body?: string;
  /** pares chave/valor */
  items?: { key: string; value: string }[];
  /** listas simples */
  lines?: string[];
  /** checklist */
  checklist?: { label: string; done: boolean }[];
  /** `kind: "clarificationQa"` */
  qaPairs?: ClarificationQaPair[];
  /** `kind: "semanticSubsteps"` */
  substeps?: SemanticSubstepLine[];
};

export type ExecutionTimelineCard = {
  stepId: ExecutionStepId;
  anchorId: string;
  title: string;
  status: OperationalStepStatus;
  surfaceStatus: ExecutionStepSurfaceStatus;
  summaryLine: string;
  timestamp: string | null;
  highlights: ExecutionTimelineCardHighlight[];
  expandedSections: ExecutionTimelineCardSection[];
  actions: ExecutionTimelineCardAction[];
  expandable: boolean;
  defaultExpanded: boolean;
  priority: number;
  category: ExecutionStepCategory;
  /** Quando true, o pai injeta widget (composer, painel) no expanded */
  hasEmbeddedSlot: boolean;
  checkpointSeverity?: "info" | "success" | "warning" | "error" | null;
  /** Timeline semântica agregada — âncora e slots */
  semanticPhaseId?: SemanticWorkflowPhaseId;
  embeddedSlotStepId?: ExecutionStepId | null;
};

export function operationalToSurfaceStatus(
  s: OperationalStepStatus,
): ExecutionStepSurfaceStatus {
  if (s === "completed") return "done";
  if (s === "failed" || s === "blocked" || s === "cancelled") return "blocked";
  if (s === "pending") return "pending";
  return "active";
}

export function executionCardAnchorId(stepId: ExecutionStepId): string {
  return `exec-card-${stepId}`;
}

/** Card da timeline após agregação semântica (campos obrigatórios). */
export type SemanticExecutionTimelineCard = ExecutionTimelineCard & {
  semanticPhaseId: SemanticWorkflowPhaseId;
  embeddedSlotStepId: ExecutionStepId | null;
};
