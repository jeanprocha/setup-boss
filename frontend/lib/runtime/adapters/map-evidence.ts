import type {
  ArtifactContentDto,
  ArtifactSummaryDto,
  ConsoleLineDto,
  DiagnosticDto,
  IntegritySummaryDto,
  RunEvidenceDto,
} from "@/lib/api/evidence-types";
import type {
  ArtifactCategory,
  ArtifactSource,
  ArtifactStatus,
  ArtifactVm,
  DiagnosticSeverity,
  DiagnosticVm,
  IntegrityReportVm,
  RunEvidenceBundle,
} from "@/lib/runtime/evidence-types";
import {
  inferArtifactCategory,
  normalizeMimeFromName,
} from "@/lib/runtime/adapters/artifact-adapters";

function formatBytes(n: number): string {
  if (!Number.isFinite(n) || n < 0) return "—";
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}

function formatClock(iso: string | null | undefined): string {
  if (!iso) return "—";
  const t = Date.parse(iso);
  if (!Number.isFinite(t)) return iso.slice(0, 19);
  return new Date(t).toLocaleTimeString("pt-PT", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  });
}

function formatModifiedShort(iso: string | null | undefined): string {
  if (!iso) return "—";
  const t = Date.parse(iso);
  if (!Number.isFinite(t)) return String(iso).slice(0, 16);
  return new Date(t).toLocaleString("pt-PT", {
    day: "2-digit",
    month: "2-digit",
    year: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function mapArtifactStatus(s: string): ArtifactStatus {
  if (s === "stale" || s === "pending") return s;
  return "ready";
}

function mapArtifactSource(s: string): ArtifactSource {
  if (s === "bundle" || s === "synthesized") return s;
  return "runtime";
}

function mapCategory(
  dto: ArtifactSummaryDto,
): ArtifactCategory {
  const c = dto.category;
  const allowed: ArtifactCategory[] = [
    "runtime",
    "strategy",
    "execution",
    "review",
    "correction",
    "rollback",
    "diagnostics",
    "integrity",
    "observability",
  ];
  if (c && allowed.includes(c as ArtifactCategory)) {
    return c as ArtifactCategory;
  }
  return inferArtifactCategory(dto.relativePath, dto.name);
}

export function mapArtifactSummaryToVm(
  dto: ArtifactSummaryDto,
  content = "",
): ArtifactVm {
  const mime = dto.mime || normalizeMimeFromName(dto.name);
  return {
    id: dto.id,
    runId: dto.runId,
    displayName: dto.name,
    virtualPath: dto.relativePath.includes("/")
      ? `${dto.relativePath.split("/").slice(0, -1).join("/")}/`
      : "",
    category: mapCategory(dto),
    mime,
    sizeLabel: formatBytes(dto.sizeBytes),
    modifiedAtLabel: formatModifiedShort(dto.modifiedAt),
    status: mapArtifactStatus(dto.status),
    source: mapArtifactSource(dto.source),
    content,
    relatedPhase: dto.phase,
    correlationKey: dto.relativePath,
  };
}

export function mapArtifactContentToVm(dto: ArtifactContentDto): ArtifactVm {
  const base = mapArtifactSummaryToVm(dto, dto.content ?? "");
  return base;
}

function mapDiagnosticSeverity(s: string): DiagnosticSeverity {
  const x = s.toLowerCase();
  if (x === "error") return "error";
  if (x === "warn" || x === "warning") return "warn";
  if (x === "integrity") return "integrity";
  return "info";
}

function mapDiagnosticKind(s: string): DiagnosticVm["kind"] {
  if (s === "integrity") return "integrity";
  if (s === "error") return "error";
  return "warning";
}

export function mapDiagnosticToVm(dto: DiagnosticDto): DiagnosticVm {
  const sev = mapDiagnosticSeverity(dto.severity);
  return {
    id: dto.id,
    severity: sev,
    code: dto.code,
    message: dto.message,
    tsLabel: formatClock(dto.ts),
    relatedArtifactId: dto.relatedArtifactId,
    relatedPhase: dto.phase,
    relatedRunId: dto.runId,
    kind: mapDiagnosticKind(sev),
  };
}

export function mapIntegrityToVm(
  dto: IntegritySummaryDto | null,
): IntegrityReportVm | null {
  if (!dto) return null;
  const state =
    dto.state === "ok" || dto.state === "degraded" || dto.state === "failed"
      ? dto.state
      : "degraded";
  const passWarn = (v: string | null): "pass" | "warn" | "fail" => {
    const x = (v || "").toLowerCase();
    if (x === "pass" || x === "ok") return "pass";
    if (x === "fail" || x === "failed") return "fail";
    if (x === "warn") return "warn";
    return "warn";
  };
  return {
    state,
    validatedAtLabel: formatClock(dto.validatedAt),
    validationSource: dto.validationSource || "runtime",
    continuity: passWarn(dto.continuity),
    crossValidation: passWarn(dto.crossValidation),
    summary:
      dto.summary ||
      `Integridade ${state} — avisos: ${dto.warningsCount}, inconsistências: ${dto.inconsistenciesCount}.`,
    warningsCount: dto.warningsCount,
    inconsistenciesCount: dto.inconsistenciesCount,
  };
}

export function mapConsoleLines(lines: ConsoleLineDto[]): string[] {
  return lines.map((l) => {
    const ts = l.ts ? formatClock(l.ts) : "—";
    return `[${ts}] ${l.message}`;
  });
}

export function mapRunEvidenceDtoToBundle(dto: RunEvidenceDto): RunEvidenceBundle {
  return {
    runId: dto.runId,
    artifacts: dto.artifacts.map((a) => mapArtifactSummaryToVm(a, "")),
    diagnostics: dto.diagnostics.map(mapDiagnosticToVm),
    integrity: mapIntegrityToVm(dto.integrity),
    consoleLines: mapConsoleLines(dto.consoleLines),
    isSynthetic: false,
    truncatedListing: Boolean(dto.truncatedListing),
  };
}
