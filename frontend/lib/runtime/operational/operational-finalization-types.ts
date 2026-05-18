export type OperationalFinalizationHitlStatus =
  | "pending"
  | "finalized"
  | "adjustment_requested";

export type OperationalFinalizationHitlDto = {
  status: OperationalFinalizationHitlStatus;
  operatorNotes: string;
  createdAt: string | null;
  finalizedAt: string | null;
  adjustmentRequestedAt: string | null;
};

export type OperationalFinalizationSessionDto = {
  runId: string;
  hitl: OperationalFinalizationHitlDto;
  reviewConfirmedAt: string | null;
  executionLifecyclePhase: string | null;
  source: "runtime" | "default";
};

export type OperationalFinalizationChecklistRow = {
  id: string;
  label: string;
  state: "done" | "partial" | "pending" | "attention";
  stateLabelPt: string;
  detail: string | null;
};

export type OperationalFinalizationSummary = {
  activityLabel: string | null;
  checklist: OperationalFinalizationChecklistRow[];
  knownPending: string[];
  changedFiles: string[];
  humanNextStepsNote: string;
  hasContent: boolean;
};
