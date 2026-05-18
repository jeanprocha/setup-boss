export type OperationalReviewHitlStatus =
  | "pending"
  | "confirmed"
  | "adjustment_requested";

export type OperationalReviewHitlDto = {
  status: OperationalReviewHitlStatus;
  operatorNotes: string;
  createdAt: string | null;
  confirmedAt: string | null;
  adjustmentRequestedAt: string | null;
};

export type OperationalReviewSessionDto = {
  runId: string;
  hitl: OperationalReviewHitlDto;
  executionLifecyclePhase: string | null;
  source: "runtime" | "default";
};

export type OperationalReviewCriterionRow = {
  id: string;
  label: string;
  state: "met" | "pending" | "attention" | "unknown";
  stateLabelPt: string;
  detail: string | null;
};

export type OperationalReviewValidationRow = {
  id: string;
  label: string;
  severity: "ok" | "warn" | "fail" | "info";
  detail: string | null;
};

export type OperationalReviewPresentation = {
  summary: string | null;
  changedFiles: string[];
  acceptanceCriteria: OperationalReviewCriterionRow[];
  validations: OperationalReviewValidationRow[];
  risksAndPending: string[];
  automaticValidationLabel: string | null;
  adjustmentsLabel: string | null;
  hasContent: boolean;
};
