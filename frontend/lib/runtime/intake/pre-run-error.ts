import {
  parseIaValidation,
  type IaValidationPayload,
} from "./ia-validation.ts";

export type StructuredPreRunError = {
  code: string;
  phase?: string;
  title?: string;
  message: string;
  description?: string;
  summary?: string;
  iaValidation?: IaValidationPayload | Record<string, unknown>;
  validationSnapshot?: Record<string, unknown>;
  groupedDiagnostics?: Record<string, unknown>;
  projectId?: string | null;
  projectRoot?: string | null;
  details?: Record<string, unknown>;
  missingFiles?: string[];
  requiredFiles?: string[];
  existingFiles?: string[];
  missingDirectories?: string[];
  missingIndexFiles?: string[];
  requiredDirectories?: string[];
  requiredIndexFiles?: string[];
  invalidBootstrapFiles?: string[];
  allowedBootstrapFiles?: string[];
  criticalDrift?: string[];
  warnings?: string[];
  unknownFolders?: string[];
  unexpectedRootFiles?: string[];
  duplicatedBootstrapPrompts?: string[];
  legacyIaPath?: string | null;
  specVersion?: string | null;
  detectedSpecVersion?: string | null;
  supportedVersions?: string[];
  indexPath?: string | null;
  suggestedActions?: string[];
  traceId?: string;
  timestamp?: string;
};

const KNOWLEDGE_CODES = new Set([
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

function pickStringArray(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  return raw.map((v) => String(v)).filter(Boolean);
}

function fromStructureDetails(
  err: StructuredPreRunError,
  key: string,
): string[] {
  const sv = err.details?.structureValidation;
  if (!sv || typeof sv !== "object") return [];
  const v = (sv as Record<string, unknown>)[key];
  return pickStringArray(v);
}

function fromDriftDetails(
  err: StructuredPreRunError,
  key: string,
): string[] {
  const dv = err.details?.driftValidation;
  if (!dv || typeof dv !== "object") return [];
  const v = (dv as Record<string, unknown>)[key];
  return pickStringArray(v);
}

export function parseStructuredPreRunError(
  raw: unknown,
): StructuredPreRunError | null {
  if (!raw || typeof raw !== "object") return null;
  const e = raw as Record<string, unknown>;
  const message = e.message != null ? String(e.message).trim() : "";
  const code = e.code != null ? String(e.code).trim() : "";
  if (!code && !message) return null;
  return {
    code: code || "run_create_failed",
    phase: e.phase != null ? String(e.phase) : undefined,
    title: e.title != null ? String(e.title) : undefined,
    message: message || String(e.title || code),
    description:
      e.description != null ? String(e.description) : undefined,
    projectId: e.projectId != null ? String(e.projectId) : null,
    projectRoot: e.projectRoot != null ? String(e.projectRoot) : null,
    details:
      e.details && typeof e.details === "object" && !Array.isArray(e.details)
        ? (e.details as Record<string, unknown>)
        : undefined,
    suggestedActions: Array.isArray(e.suggestedActions)
      ? e.suggestedActions.map((s) => String(s)).filter(Boolean)
      : undefined,
    missingFiles: pickStringArray(e.missingFiles),
    requiredFiles: pickStringArray(e.requiredFiles),
    existingFiles: pickStringArray(e.existingFiles),
    missingDirectories: pickStringArray(e.missingDirectories),
    missingIndexFiles: pickStringArray(e.missingIndexFiles),
    requiredDirectories: pickStringArray(e.requiredDirectories),
    requiredIndexFiles: pickStringArray(e.requiredIndexFiles),
    invalidBootstrapFiles: pickStringArray(e.invalidBootstrapFiles),
    allowedBootstrapFiles: pickStringArray(e.allowedBootstrapFiles),
    criticalDrift: pickStringArray(e.criticalDrift),
    warnings: pickStringArray(e.warnings),
    unknownFolders: pickStringArray(e.unknownFolders),
    unexpectedRootFiles: pickStringArray(e.unexpectedRootFiles),
    duplicatedBootstrapPrompts: pickStringArray(e.duplicatedBootstrapPrompts),
    legacyIaPath:
      e.legacyIaPath != null && String(e.legacyIaPath).trim()
        ? String(e.legacyIaPath).trim()
        : null,
    specVersion:
      e.specVersion != null && String(e.specVersion).trim()
        ? String(e.specVersion).trim()
        : null,
    detectedSpecVersion:
      e.detectedSpecVersion != null && String(e.detectedSpecVersion).trim()
        ? String(e.detectedSpecVersion).trim()
        : null,
    supportedVersions: pickStringArray(e.supportedVersions),
    indexPath:
      e.indexPath != null && String(e.indexPath).trim()
        ? String(e.indexPath).trim()
        : null,
    summary: e.summary != null ? String(e.summary) : undefined,
    iaValidation: parseIaValidation(e.iaValidation) ?? undefined,
    validationSnapshot:
      e.validationSnapshot && typeof e.validationSnapshot === "object"
        ? (e.validationSnapshot as Record<string, unknown>)
        : undefined,
    groupedDiagnostics:
      e.groupedDiagnostics && typeof e.groupedDiagnostics === "object"
        ? (e.groupedDiagnostics as Record<string, unknown>)
        : undefined,
    traceId: e.traceId != null ? String(e.traceId) : undefined,
    timestamp: e.timestamp != null ? String(e.timestamp) : undefined,
  };
}

export function intakeMissingFiles(err: StructuredPreRunError): string[] {
  if (err.missingFiles?.length) return err.missingFiles;
  const seed = err.details?.seedValidation;
  if (
    seed &&
    typeof seed === "object" &&
    Array.isArray((seed as { missingFiles?: unknown }).missingFiles)
  ) {
    return (seed as { missingFiles: string[] }).missingFiles.map(String);
  }
  return [];
}

export function intakeMissingDirectories(err: StructuredPreRunError): string[] {
  if (err.missingDirectories?.length) return err.missingDirectories;
  return fromStructureDetails(err, "missingDirectories");
}

export function intakeMissingIndexFiles(err: StructuredPreRunError): string[] {
  if (err.missingIndexFiles?.length) return err.missingIndexFiles;
  return fromStructureDetails(err, "missingIndexFiles");
}

export function intakeInvalidBootstrapFiles(
  err: StructuredPreRunError,
): string[] {
  if (err.invalidBootstrapFiles?.length) return err.invalidBootstrapFiles;
  const dup = intakeDuplicatedBootstrapPrompts(err);
  if (dup.length) return dup;
  return fromStructureDetails(err, "invalidBootstrapFiles");
}

export function intakeCriticalDrift(err: StructuredPreRunError): string[] {
  if (err.criticalDrift?.length) return err.criticalDrift;
  return fromDriftDetails(err, "criticalDrift");
}

export function intakeDriftWarnings(err: StructuredPreRunError): string[] {
  if (err.warnings?.length) return err.warnings;
  return fromDriftDetails(err, "warnings");
}

export function intakeUnknownFolders(err: StructuredPreRunError): string[] {
  if (err.unknownFolders?.length) return err.unknownFolders;
  return fromDriftDetails(err, "unknownFolders");
}

export function intakeUnexpectedRootFiles(err: StructuredPreRunError): string[] {
  if (err.unexpectedRootFiles?.length) return err.unexpectedRootFiles;
  return fromDriftDetails(err, "unexpectedRootFiles");
}

export function intakeDuplicatedBootstrapPrompts(
  err: StructuredPreRunError,
): string[] {
  if (err.duplicatedBootstrapPrompts?.length) return err.duplicatedBootstrapPrompts;
  return fromDriftDetails(err, "duplicatedBootstrapPrompts");
}

export function intakeLegacyIaPath(err: StructuredPreRunError): string | null {
  if (err.legacyIaPath?.trim()) return err.legacyIaPath.trim();
  const dv = err.details?.driftValidation;
  if (dv && typeof dv === "object") {
    const p = (dv as { legacyIaPath?: unknown }).legacyIaPath;
    if (p != null && String(p).trim()) return String(p).trim();
  }
  return null;
}

export function intakeInlineTitle(err: StructuredPreRunError): string {
  if (KNOWLEDGE_CODES.has(err.code)) {
    if (err.code === "KNOWLEDGE_BASE_UNTRACKED") {
      return "Base de conhecimento não versionada";
    }
    if (err.code === "KNOWLEDGE_BASE_IGNORED") {
      return "Base de conhecimento ignorada pelo Git";
    }
    if (err.code === "KNOWLEDGE_BASE_MISSING") {
      return "Base de conhecimento não encontrada";
    }
    if (err.code === "KNOWLEDGE_BASE_INVALID_SEED") {
      return "Estrutura mínima da `.IA` incompleta";
    }
    if (err.code === "KNOWLEDGE_BASE_INVALID_STRUCTURE") {
      return "Estrutura governada da `.IA` incompleta";
    }
    if (err.code === "KNOWLEDGE_BASE_BOOTSTRAP_OWNERSHIP_VIOLATION") {
      return "Bootstrap prompts em local incorreto";
    }
    if (err.code === "KNOWLEDGE_BASE_STRUCTURAL_DRIFT") {
      return "Drift estrutural detectado na `.IA`";
    }
    if (
      err.code === "KNOWLEDGE_BASE_VERSION_MISSING" ||
      err.code === "KNOWLEDGE_BASE_VERSION_INVALID" ||
      err.code === "KNOWLEDGE_BASE_UNSUPPORTED_VERSION"
    ) {
      return "Versão da SPEC `.IA` inválida";
    }
    if (err.code === "KNOWLEDGE_BASE_SENSITIVE_DATA") {
      return "Possível dado sensível na `.IA`";
    }
    if (err.code === "KNOWLEDGE_BASE_LANGUAGE_WARNING") {
      return "Aviso de idioma da `.IA`";
    }
  }
  if (err.title?.trim()) return err.title.trim();
  return err.message;
}

export function intakeInlineBody(err: StructuredPreRunError): string {
  if (err.code === "KNOWLEDGE_BASE_UNTRACKED") {
    return (
      "O projeto possui `docs/.IA`, mas ela ainda não foi adicionada ao Git. " +
      "Revise o conteúdo, execute `git add docs/.IA` e faça commit antes de iniciar a execução."
    );
  }
  if (err.code === "KNOWLEDGE_BASE_INVALID_SEED") {
    return (
      "O projeto não possui todos os ficheiros obrigatórios do seed `.IA` v1.0. " +
      "Crie os ficheiros em falta e versione-os no Git antes de iniciar a execução."
    );
  }
  if (err.code === "KNOWLEDGE_BASE_INVALID_STRUCTURE") {
    return (
      "O projeto possui o seed obrigatório, mas ainda não possui a estrutura core da SPEC v1.0. " +
      "Crie os domínios e indexes em falta antes de iniciar a execução."
    );
  }
  if (err.code === "KNOWLEDGE_BASE_BOOTSTRAP_OWNERSHIP_VIOLATION") {
    return (
      "Os prompts de bootstrap pertencem exclusivamente a `docs/.IA/system`. " +
      "Remova cópias noutros domínios e mantenha apenas os ficheiros em system/."
    );
  }
  if (err.code === "KNOWLEDGE_BASE_STRUCTURAL_DRIFT") {
    return (
      "A estrutura da `.IA` possui arquivos ou caminhos que violam a SPEC v1.0. " +
      "Corrija o drift crítico antes de iniciar a execução."
    );
  }
  if (
    err.code === "KNOWLEDGE_BASE_VERSION_MISSING" ||
    err.code === "KNOWLEDGE_BASE_VERSION_INVALID" ||
    err.code === "KNOWLEDGE_BASE_UNSUPPORTED_VERSION"
  ) {
    return (
      "O projeto possui uma `.IA`, mas a versão declarada não é suportada pelo Setup-Boss. " +
      "Corrija `docs/.IA/index.md` (ex.: Version: 1.0)."
    );
  }
  if (err.code === "KNOWLEDGE_BASE_IGNORED" && err.description?.trim()) {
    return err.description.trim();
  }
  if (err.code === "KNOWLEDGE_BASE_MISSING" && err.description?.trim()) {
    return err.description.trim();
  }
  if (err.description?.trim()) return err.description.trim();
  return err.message;
}

function formatOperationalGovernanceReport(err: StructuredPreRunError): string {
  const snap = err.validationSnapshot;
  const spec =
    err.specVersion?.trim() ||
    (snap?.specVersion != null ? String(snap.specVersion) : null);
  const durationMs =
    typeof snap?.validationDurationMs === "number"
      ? snap.validationDurationMs
      : null;
  const warnings = Array.isArray(snap?.warnings)
    ? snap.warnings.map((w) => String(w)).filter(Boolean)
    : err.warnings ?? [];
  const errors = Array.isArray(snap?.errors) ? snap.errors.length : 0;

  const lines = [
    "=== Setup-Boss — .IA Governance Report ===",
    "",
    err.projectId ? `projectId: ${err.projectId}` : null,
    err.projectRoot ? `projectRoot: ${err.projectRoot}` : null,
    err.traceId ? `traceId: ${err.traceId}` : null,
    err.timestamp ? `timestamp: ${err.timestamp}` : null,
    "",
    `code: ${err.code}`,
    err.phase ? `phase: ${err.phase}` : null,
    err.title ? `title: ${err.title}` : null,
    `message: ${err.message}`,
    err.summary ? `summary: ${err.summary}` : null,
    err.description ? `description: ${err.description}` : null,
    "",
    spec ? `specVersion: ${spec}` : null,
    durationMs != null ? `validationDurationMs: ${durationMs}` : null,
    `warnings: ${warnings.length}`,
    `errors: ${errors || (err.code ? 1 : 0)}`,
    "",
    err.suggestedActions?.length
      ? [
          "--- Suggested actions ---",
          ...err.suggestedActions.map((a, i) => `  ${i + 1}. ${a}`),
          "",
        ].join("\n")
      : null,
    err.iaValidation
      ? `--- iaValidation ---\n${JSON.stringify(err.iaValidation, null, 2)}\n`
      : null,
    snap
      ? `--- validationSnapshot ---\n${JSON.stringify(snap, null, 2)}`
      : null,
  ].filter(Boolean);
  return lines.join("\n");
}

export function formatPreRunDiagnosticCopy(err: StructuredPreRunError): string {
  if (err.iaValidation || err.validationSnapshot) {
    return formatOperationalGovernanceReport(err);
  }

  const missingDirs = intakeMissingDirectories(err);
  const missingIdx = intakeMissingIndexFiles(err);
  const invalidBoot = intakeInvalidBootstrapFiles(err);
  const criticalDrift = intakeCriticalDrift(err);
  const driftWarnings = intakeDriftWarnings(err);
  const legacyPath = intakeLegacyIaPath(err);

  const lines = [
    `code: ${err.code}`,
    err.phase ? `phase: ${err.phase}` : null,
    err.title ? `title: ${err.title}` : null,
    `message: ${err.message}`,
    err.description ? `description: ${err.description}` : null,
    err.projectId ? `projectId: ${err.projectId}` : null,
    err.projectRoot ? `projectRoot: ${err.projectRoot}` : null,
    err.traceId ? `traceId: ${err.traceId}` : null,
    err.timestamp ? `timestamp: ${err.timestamp}` : null,
    err.suggestedActions?.length
      ? `suggestedActions:\n${err.suggestedActions.map((a, i) => `  ${i + 1}. ${a}`).join("\n")}`
      : null,
    intakeMissingFiles(err).length
      ? `missingFiles:\n${intakeMissingFiles(err).map((f) => `  - ${f}`).join("\n")}`
      : null,
    missingDirs.length
      ? `missingDirectories:\n${missingDirs.map((d) => `  - ${d}`).join("\n")}`
      : null,
    missingIdx.length
      ? `missingIndexFiles:\n${missingIdx.map((f) => `  - ${f}`).join("\n")}`
      : null,
    invalidBoot.length
      ? `invalidBootstrapFiles:\n${invalidBoot.map((f) => `  - ${f}`).join("\n")}`
      : null,
    criticalDrift.length
      ? `criticalDrift:\n${criticalDrift.map((m) => `  - ${m}`).join("\n")}`
      : null,
    driftWarnings.length
      ? `warnings:\n${driftWarnings.map((m) => `  - ${m}`).join("\n")}`
      : null,
    legacyPath ? `legacyIaPath: ${legacyPath}` : null,
    err.details ? `details:\n${JSON.stringify(err.details, null, 2)}` : null,
  ].filter(Boolean);
  return lines.join("\n");
}
