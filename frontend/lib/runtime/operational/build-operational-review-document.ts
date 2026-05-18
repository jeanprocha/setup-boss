import type { ClarificationBundleDto } from "../clarification/clarification-types.ts";
import {
  normalizeRefinementPreview,
  parseRefinedPlanPresentation,
} from "../clarification/parse-refined-plan.ts";
import type { ExecutionBundleDto } from "../execution/execution-types.ts";
import type { RunEvidenceBundle } from "../evidence-types.ts";
import type {
  OperationalReviewCriterionRow,
  OperationalReviewPresentation,
  OperationalReviewValidationRow,
} from "./operational-review-types.ts";
import { humanizeOperationalReviewValidationLabel } from "./operational-review-event-labels.ts";
import { isExecutionOperationallyComplete } from "./review-operational-state.ts";
import type { RunSummaryDto } from "../../api/runtime-types.ts";

const SOURCE_FILE_RE =
  /^[\w./-]+\.(tsx?|jsx?|vue|css|scss|md|json|ya?ml|html)$/i;

function uniqueStrings(items: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const item of items) {
    const t = item.trim();
    if (!t || seen.has(t)) continue;
    seen.add(t);
    out.push(t);
  }
  return out;
}

function normalizeCriterionKey(label: string): string {
  return label
    .replace(/^critério:\s*/i, "")
    .trim()
    .toLowerCase();
}

function dedupeCriteriaLabels(labels: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of labels) {
    const t = raw.trim();
    if (!t) continue;
    const display = t.startsWith("Critério:") ? t : `Critério: ${t}`;
    const key = normalizeCriterionKey(display);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    out.push(display);
  }
  return out;
}

function safeParseJson(text: string): Record<string, unknown> | null {
  try {
    const j = JSON.parse(text);
    return j && typeof j === "object" && !Array.isArray(j) ? j : null;
  } catch {
    return null;
  }
}

function extractChangedFilesFromReviewOutput(
  doc: Record<string, unknown>,
): string[] {
  const out: string[] = [];
  const ctx = doc.execution_context;
  if (ctx && typeof ctx === "object" && !Array.isArray(ctx)) {
    const allowed = (ctx as Record<string, unknown>).allowed_files;
    if (Array.isArray(allowed)) {
      for (const f of allowed) out.push(String(f));
    }
  }
  const changed = doc.changed_files;
  if (Array.isArray(changed)) {
    for (const row of changed) {
      if (typeof row === "string") out.push(row);
      else if (row && typeof row === "object") {
        const p =
          (row as Record<string, unknown>).path ??
          (row as Record<string, unknown>).file;
        if (p != null) out.push(String(p));
      }
    }
  }
  return uniqueStrings(out);
}

function findReviewOutputArtifact(
  evidence: RunEvidenceBundle | null | undefined,
): Record<string, unknown> | null {
  if (!evidence?.artifacts?.length) return null;
  const art =
    evidence.artifacts.find(
      (a) =>
        a.displayName === "review-output.json" ||
        a.virtualPath.endsWith("review-output.json"),
    ) ?? evidence.artifacts.find((a) => a.category === "review" && a.displayName.endsWith(".json"));
  if (!art?.content?.trim()) return null;
  return safeParseJson(art.content);
}

function inferChangedFilesFromEvidence(
  evidence: RunEvidenceBundle | null | undefined,
): string[] {
  const fromReview = findReviewOutputArtifact(evidence);
  if (fromReview) return extractChangedFilesFromReviewOutput(fromReview);

  if (!evidence?.artifacts?.length) return [];
  const paths: string[] = [];
  for (const a of evidence.artifacts) {
    const vp = a.virtualPath.replace(/\\/g, "/");
    const base = vp.split("/").pop() ?? vp;
    if (
      (a.category === "execution" || vp.includes("execution/")) &&
      SOURCE_FILE_RE.test(base) &&
      !base.includes("execution-review")
    ) {
      paths.push(vp);
    }
  }
  return uniqueStrings(paths).slice(0, 40);
}

function labelAutomaticValidation(
  reviewDoc: Record<string, unknown> | null,
  execution: ExecutionBundleDto | null | undefined,
): string | null {
  const st = reviewDoc?.status != null ? String(reviewDoc.status).toLowerCase() : "";
  if (st === "approved") return "Validação automática concluída com sucesso";
  if (st === "rejected" || st === "blocked") return "Validação automática sinalizou pontos de atenção";
  const agg = execution?.summary.review.status;
  if (agg === "approved") return "Validação automática concluída com sucesso";
  if (agg === "rejected" || agg === "pending") {
    return "Validação automática em análise ou com ressalvas";
  }
  return null;
}

function labelAdjustments(execution: ExecutionBundleDto | null | undefined): string | null {
  const corr = execution?.summary.correction;
  if (!corr || corr.status === "idle" || corr.generation === 0) return null;
  if (corr.status === "active") return "Ajustes automáticos em curso durante a execução";
  if (corr.approvedAfterCorrection) return "Ajustes automáticos aplicados e validados";
  return "Ajustes automáticos registados na execução";
}

function buildCriteriaRows(
  labels: string[],
  execution: ExecutionBundleDto | null | undefined,
  executionComplete: boolean,
): OperationalReviewCriterionRow[] {
  const completed = execution?.summary.progress.completed ?? 0;
  const total = execution?.summary.progress.total ?? 0;
  const allDone =
    executionComplete || (total > 0 && completed >= total);

  return labels.map((label, idx) => {
    let state: OperationalReviewCriterionRow["state"] = "unknown";
    let stateLabelPt = "A verificar";
    if (allDone) {
      state = "met";
      stateLabelPt = "Atendido";
    } else if (completed > 0) {
      state = "attention";
      stateLabelPt = "Parcial";
    }
    return {
      id: `criterion-${idx}`,
      label,
      state,
      stateLabelPt,
      detail: null,
    };
  });
}

function buildValidationRows(
  evidence: RunEvidenceBundle | null | undefined,
  reviewDoc: Record<string, unknown> | null,
): OperationalReviewValidationRow[] {
  const rows: OperationalReviewValidationRow[] = [];
  let i = 0;

  if (evidence?.integrity) {
    const st = evidence.integrity.state;
    rows.push({
      id: `val-${i++}`,
      label: "Integridade dos artefactos",
      severity: st === "ok" ? "ok" : st === "failed" ? "fail" : "warn",
      detail: evidence.integrity.summary,
    });
  }

  for (const d of evidence?.diagnostics ?? []) {
    if (rows.length >= 8) break;
    const sev =
      d.severity === "error"
        ? "fail"
        : d.severity === "warn"
          ? "warn"
          : "info";
    const label = humanizeOperationalReviewValidationLabel(
      d.code || d.message,
    );
    if (!label) continue;
    rows.push({
      id: `val-${i++}`,
      label,
      severity: sev,
      detail: null,
    });
  }

  const warnings = reviewDoc?.warnings;
  if (Array.isArray(warnings)) {
    for (const w of warnings) {
      if (rows.length >= 12) break;
      const msg = String(w).trim();
      if (!msg) continue;
      rows.push({
        id: `val-${i++}`,
        label: msg.slice(0, 140),
        severity: "warn",
        detail: null,
      });
    }
  }

  const blocking = reviewDoc?.blocking_issues;
  if (Array.isArray(blocking)) {
    for (const b of blocking) {
      if (rows.length >= 12) break;
      const msg = String(b).trim();
      if (!msg) continue;
      rows.push({
        id: `val-${i++}`,
        label: msg.slice(0, 140),
        severity: "fail",
        detail: null,
      });
    }
  }

  return rows;
}

export function buildOperationalReviewDocument(input: {
  clarification: ClarificationBundleDto | null | undefined;
  execution: ExecutionBundleDto | null | undefined;
  evidence: RunEvidenceBundle | null | undefined;
  activityLabel?: string | null;
  summary?: RunSummaryDto | null;
  executionLifecyclePhase?: string | null;
}): OperationalReviewPresentation {
  const {
    clarification,
    execution,
    evidence,
    activityLabel,
    summary: runSummary,
    executionLifecyclePhase,
  } = input;

  const executionComplete = isExecutionOperationallyComplete(
    executionLifecyclePhase as Parameters<
      typeof isExecutionOperationallyComplete
    >[0],
    runSummary ?? null,
  );

  const refinement = normalizeRefinementPreview(clarification?.refinement);
  const refined = parseRefinedPlanPresentation(
    refinement,
    refinement.refinedTask,
  );

  const criteriaLabels = dedupeCriteriaLabels([
    ...refined.acceptanceCriteria,
    ...(clarification?.refinement.acceptanceCriteria ?? []).map((c) =>
      c.startsWith("Critério:") ? c : `Critério: ${c}`,
    ),
  ]);

  const reviewDoc = findReviewOutputArtifact(evidence);
  const changedFiles = inferChangedFilesFromEvidence(evidence);

  const subtasks = execution?.subtasks ?? [];
  const doneTitles = subtasks
    .filter((s) => s.state === "completed" || s.state === "recovered")
    .map((s) => s.title);

  const summaryParts: string[] = [];
  if (activityLabel?.trim()) summaryParts.push(activityLabel.trim());
  if (refined.objective) summaryParts.push(refined.objective);
  if (doneTitles.length > 0) {
    summaryParts.push(
      `Entregas concluídas: ${doneTitles.slice(0, 6).join("; ")}${doneTitles.length > 6 ? "…" : ""}`,
    );
  } else if (executionComplete) {
    summaryParts.push("Execução concluída.");
  } else if (execution?.summary.progress.total) {
    const p = execution.summary.progress;
    const showRatio = p.completed > 0;
    if (showRatio) {
      summaryParts.push(
        `Progresso: ${p.completed}/${p.total} etapas concluídas.`,
      );
    }
  }
  if (reviewDoc?.summary != null && String(reviewDoc.summary).trim()) {
    summaryParts.push(String(reviewDoc.summary).trim());
  }

  const risksAndPending = uniqueStrings([
    ...refined.risks,
    ...(clarification?.refinement.risks ?? []),
    ...(execution?.summary.blockers.map((b) => b.label) ?? []),
  ]);

  const acceptanceCriteria = buildCriteriaRows(
    criteriaLabels,
    execution,
    executionComplete,
  );
  const validations = buildValidationRows(evidence, reviewDoc);

  const summary = summaryParts.join("\n\n").trim() || null;

  return {
    summary,
    changedFiles,
    acceptanceCriteria,
    validations,
    risksAndPending,
    automaticValidationLabel: labelAutomaticValidation(reviewDoc, execution),
    adjustmentsLabel: labelAdjustments(execution),
    hasContent:
      Boolean(summary) ||
      changedFiles.length > 0 ||
      acceptanceCriteria.length > 0 ||
      validations.length > 0 ||
      risksAndPending.length > 0,
  };
}
