/** DTOs read-only — contrato GET /runs/:id/evidence e artifact content. */

export type ArtifactSummaryDto = {
  id: string;
  runId: string;
  name: string;
  relativePath: string;
  mime: string;
  sizeBytes: number;
  /** ISO 8601 — mtime no filesystem do daemon */
  modifiedAt?: string | null;
  phase: string | null;
  source: string;
  status: string;
  category: string | null;
};

export type DiagnosticDto = {
  id: string;
  runId: string;
  severity: string;
  code: string;
  message: string;
  phase: string | null;
  source: string;
  status: string;
  relatedArtifactId: string | null;
  ts: string | null;
};

export type IntegritySummaryDto = {
  runId: string;
  state: string;
  validatedAt: string | null;
  validationSource: string | null;
  continuity: string | null;
  crossValidation: string | null;
  summary: string | null;
  warningsCount: number;
  inconsistenciesCount: number;
};

export type ConsoleLineDto = {
  ts: string | null;
  level: string;
  message: string;
};

export type RunEvidenceDto = {
  runId: string;
  artifacts: ArtifactSummaryDto[];
  diagnostics: DiagnosticDto[];
  integrity: IntegritySummaryDto | null;
  consoleLines: ConsoleLineDto[];
  truncatedListing?: boolean;
};

export type ArtifactContentDto = ArtifactSummaryDto & {
  content: string | null;
  truncated: boolean;
  unsupported: boolean;
};

export type RunEvidenceJson = { ok?: boolean; data?: RunEvidenceDto };

export type ArtifactContentJson = { ok?: boolean; data?: ArtifactContentDto };
