/** Categorias operacionais (evidência), não paths de disco. */
export type ArtifactCategory =
  | "runtime"
  | "strategy"
  | "execution"
  | "review"
  | "correction"
  | "rollback"
  | "diagnostics"
  | "integrity"
  | "observability";

export type ArtifactStatus = "ready" | "stale" | "pending";

export type ArtifactSource = "runtime" | "bundle" | "synthesized";

export type ArtifactVm = {
  id: string;
  runId: string;
  displayName: string;
  /** Caminho lógico para agrupamento — nunca path absoluto do SO */
  virtualPath: string;
  category: ArtifactCategory;
  mime: string;
  sizeLabel: string;
  /** Rótulo curto pt-PT para coluna “modificado” */
  modifiedAtLabel?: string;
  status: ArtifactStatus;
  source: ArtifactSource;
  content: string;
  relatedPhase: string | null;
  /** Liga a diagnostics / timeline (chave estável) */
  correlationKey: string | null;
};

export type DiagnosticSeverity = "error" | "warn" | "info" | "integrity";

export type DiagnosticVm = {
  id: string;
  severity: DiagnosticSeverity;
  code: string;
  message: string;
  tsLabel: string;
  relatedArtifactId: string | null;
  relatedPhase: string | null;
  relatedRunId: string | null;
  kind: "warning" | "error" | "integrity" | "runtime";
};

export type IntegrityReportVm = {
  state: "ok" | "degraded" | "failed";
  validatedAtLabel: string;
  validationSource: string;
  continuity: "pass" | "warn" | "fail";
  crossValidation: "pass" | "warn" | "fail";
  summary: string;
  warningsCount: number;
  inconsistenciesCount: number;
};

export type RunEvidenceBundle = {
  runId: string;
  artifacts: ArtifactVm[];
  diagnostics: DiagnosticVm[];
  integrity: IntegrityReportVm | null;
  consoleLines: string[];
  /** Quando não há dados reais do daemon */
  isSynthetic: boolean;
  /** Listagem de ficheiros no output dir truncada (MAX_ARTIFACTS no daemon) */
  truncatedListing?: boolean;
};
