"use strict";

const {
  REQUIRED_SEED_FILES,
  DOC_BOOTSTRAP_HINT,
} = require("./validate-project-knowledge-base");
const { SUPPORTED_SPEC_VERSIONS } = require("./validate-ia-spec-version");

/** @typedef {"ready"|"warning"|"blocked"} ExecutionReadiness */

/** @type {readonly { id: string, label: string }[]} */
const TIMELINE_STAGES = Object.freeze([
  { id: "git", label: "Git" },
  { id: "seed", label: "Seed" },
  { id: "version", label: "Version" },
  { id: "structure", label: "Structure" },
  { id: "drift", label: "Drift" },
  { id: "policy", label: "Policy" },
]);

/**
 * @param {Record<string, unknown>|null|undefined} snapshot
 * @returns {Record<string, unknown>|null}
 */
function asSnapshot(snapshot) {
  if (!snapshot || typeof snapshot !== "object" || Array.isArray(snapshot)) return null;
  return /** @type {Record<string, unknown>} */ (snapshot);
}

/**
 * @param {Record<string, unknown>|null|undefined} ia
 * @returns {Record<string, unknown>|null}
 */
function asIaValidation(ia) {
  if (!ia || typeof ia !== "object" || Array.isArray(ia)) return null;
  return /** @type {Record<string, unknown>} */ (ia);
}

/**
 * @param {Record<string, unknown>} result
 * @returns {number}
 */
function countWarnings(result) {
  const snap = asSnapshot(result.validationSnapshot);
  const snapWarnings = Array.isArray(snap?.warnings)
    ? snap.warnings.map((w) => String(w)).filter(Boolean)
    : [];
  const drift = Array.isArray(result.driftWarnings)
    ? result.driftWarnings.map((w) => String(w)).filter(Boolean)
    : [];
  const policy = Array.isArray(result.policyWarnings)
    ? result.policyWarnings
        .map((w) => {
          if (typeof w === "string") return w;
          if (w && typeof w === "object" && /** @type {{ message?: string }} */ (w).message) {
            return String(/** @type {{ message: string }} */ (w).message);
          }
          return "";
        })
        .filter(Boolean)
    : [];
  const ia = asIaValidation(snap?.iaValidation || result.iaValidation);
  const iaWarnings = Array.isArray(ia?.warnings)
    ? ia.warnings.map((w) => String(w)).filter(Boolean)
    : [];
  return new Set([...snapWarnings, ...drift, ...policy, ...iaWarnings]).size;
}

/**
 * @param {Record<string, unknown>} result
 * @returns {number}
 */
function countErrors(result) {
  if (result.ok === true) return 0;
  const snap = asSnapshot(result.validationSnapshot);
  const snapErrors = Array.isArray(snap?.errors) ? snap.errors.length : 0;
  if (snapErrors > 0) return snapErrors;
  const ia = asIaValidation(snap?.iaValidation || result.iaValidation);
  if (ia && Array.isArray(ia.errors)) return ia.errors.length;
  return result.code ? 1 : 0;
}

/**
 * @param {Record<string, unknown>} result
 * @returns {ExecutionReadiness}
 */
function resolveExecutionReadiness(result) {
  if (!result || result.ok !== true) return "blocked";
  if (countWarnings(result) > 0) return "warning";
  return "ready";
}

/**
 * @param {Record<string, unknown>} result
 * @param {ExecutionReadiness} readiness
 * @returns {string}
 */
function resolveGovernanceStatusHeadline(result, readiness) {
  if (readiness === "ready") return "Ready for execution";
  if (readiness === "warning") return "Execution allowed with warnings";
  const code = String(result.code || "").trim();
  if (code === "KNOWLEDGE_BASE_MISSING") return "Missing `.IA` knowledge base";
  if (code === "KNOWLEDGE_BASE_INVALID_SEED") return "Missing required seed files";
  if (code === "KNOWLEDGE_BASE_INVALID_STRUCTURE") return "Governed structure incomplete";
  if (code === "KNOWLEDGE_BASE_STRUCTURAL_DRIFT") return "Structural drift detected";
  if (code === "KNOWLEDGE_BASE_SENSITIVE_DATA") return "Content policy issue";
  if (
    code === "KNOWLEDGE_BASE_VERSION_MISSING" ||
    code === "KNOWLEDGE_BASE_VERSION_INVALID" ||
    code === "KNOWLEDGE_BASE_UNSUPPORTED_VERSION"
  ) {
    return "Unsupported or invalid SPEC version";
  }
  if (code === "KNOWLEDGE_BASE_UNTRACKED") return "Knowledge base not tracked in Git";
  if (code === "KNOWLEDGE_BASE_IGNORED") return "Knowledge base ignored by Git";
  return "Blocked by governance validation";
}

/**
 * @param {Record<string, unknown>} result
 * @returns {string}
 */
function buildHumanValidationSummary(result) {
  const snap = asSnapshot(result.validationSnapshot);
  const spec =
    result.specVersion != null && String(result.specVersion).trim()
      ? String(result.specVersion).trim()
      : snap?.specVersion != null && String(snap.specVersion).trim()
        ? String(snap.specVersion).trim()
        : null;
  const durationMs =
    typeof snap?.validationDurationMs === "number"
      ? snap.validationDurationMs
      : null;
  const readiness = resolveExecutionReadiness(result);
  const passedChecks = TIMELINE_STAGES.filter((s) => {
    const row = buildGovernanceTimeline(result).find((t) => t.id === s.id);
    return row?.status === "ok";
  }).length;

  if (readiness === "ready") {
    const parts = [
      "Knowledge Base validated successfully.",
      spec ? `SPEC v${spec} detected.` : null,
      durationMs != null
        ? `${passedChecks} governance checks passed in ${durationMs}ms.`
        : `${passedChecks} governance checks passed.`,
    ].filter(Boolean);
    return parts.join(" ");
  }

  if (readiness === "warning") {
    const w = countWarnings(result);
    return [
      "Execution allowed with governance warnings.",
      spec ? `SPEC v${spec}.` : null,
      `${w} warning(s) — review drift and content policy before production runs.`,
    ]
      .filter(Boolean)
      .join(" ");
  }

  const errN = countErrors(result);
  return [
    "Execution blocked.",
    errN > 0
      ? `${errN} governance violation(s) detected.`
      : "Governance validation failed.",
    spec ? `SPEC v${spec} expected.` : null,
  ]
    .filter(Boolean)
    .join(" ");
}

/**
 * @param {Record<string, unknown>} result
 * @returns {{
 *   id: string,
 *   label: string,
 *   status: string,
 *   durationMs: number|null,
 *   message: string|null,
 *   details: Record<string, unknown>|null,
 * }[]}
 */
function buildGovernanceTimeline(result) {
  const snap = asSnapshot(result.validationSnapshot);
  const ia = asIaValidation(snap?.iaValidation || result.iaValidation);
  const snapStages = Array.isArray(snap?.stages)
    ? /** @type {{ id?: string, durationMs?: number, status?: string }[]} */ (snap.stages)
    : [];
  const snapChecks = Array.isArray(snap?.checks)
    ? /** @type {{ id?: string, status?: string, durationMs?: number }[]} */ (snap.checks)
    : [];
  const metrics =
    snap?.metrics && typeof snap.metrics === "object"
      ? /** @type {Record<string, unknown>} */ (snap.metrics)
      : {};

  const iaChecks = Array.isArray(ia?.checks)
    ? /** @type {{ id?: string, label?: string, status?: string }[]} */ (ia.checks)
    : [];

  const failedCheck =
    snap?.failedStage != null && String(snap.failedStage).trim()
      ? String(snap.failedStage).trim()
      : iaChecks.find((c) => c.status === "fail")?.id || null;

  const firstError =
    Array.isArray(ia?.errors) && ia.errors.length
      ? /** @type {{ message?: string, code?: string }} */ (ia.errors[0])
      : Array.isArray(snap?.errors) && snap.errors.length
        ? /** @type {{ message?: string, code?: string }} */ (snap.errors[0])
        : null;

  return TIMELINE_STAGES.map((stage) => {
    const iaRow = iaChecks.find((c) => c.id === stage.id);
    const pipeRow = snapStages.find((s) => s.id === stage.id);
    const checkRow = snapChecks.find((c) => c.id === stage.id);

    let status = iaRow?.status || pipeRow?.status || checkRow?.status || "skip";
    if (result.ok === true && status === "skip" && stage.id !== "git") {
      const pipelineIds = ["seed", "version", "structure", "drift", "policy"];
      if (pipelineIds.includes(stage.id)) status = "ok";
    }
    if (result.ok === true && stage.id === "git") status = "ok";

    let durationMs = null;
    if (stage.id === "git" && typeof metrics.gitListMs === "number") {
      durationMs = metrics.gitListMs;
    } else if (typeof pipeRow?.durationMs === "number") {
      durationMs = pipeRow.durationMs;
    } else if (typeof checkRow?.durationMs === "number") {
      durationMs = checkRow.durationMs;
    }

    let message = null;
    if (status === "fail" && failedCheck === stage.id) {
      message =
        firstError?.message ||
        String(result.message || result.title || result.code || "validation failed");
    } else if (status === "warn") {
      const warns = countWarnings(result);
      message = warns > 0 ? `${warns} warning(s) in this stage` : "warning";
    }

    const detailsKey = stage.id === "version" ? "version" : stage.id;
    const details =
      ia && ia[detailsKey] && typeof ia[detailsKey] === "object"
        ? /** @type {Record<string, unknown>} */ (ia[detailsKey])
        : null;

    return {
      id: stage.id,
      label: stage.label,
      status,
      durationMs,
      message,
      details,
    };
  });
}

/**
 * @param {Record<string, unknown>} result
 * @returns {Record<string, unknown>|null}
 */
function buildOnboardingUx(result) {
  if (result.ok === true) return null;
  const code = String(result.code || "").trim();
  const needsIa =
    code === "KNOWLEDGE_BASE_MISSING" ||
    code === "KNOWLEDGE_BASE_NOT_GIT" ||
    code === "KNOWLEDGE_BASE_WRONG_PATH";

  if (!needsIa && code !== "KNOWLEDGE_BASE_INVALID_SEED") return null;

  return {
    title: "This project is not ready for Setup-Boss execution.",
    requiredStructure: [
      "docs/.IA/ (versioned in Git)",
      "docs/.IA/index.md with Version: 1.0",
      ...REQUIRED_SEED_FILES.filter((f) => f !== "docs/.IA/index.md"),
    ],
    requiredSeedFiles: [...REQUIRED_SEED_FILES],
    bootstrapDoc: DOC_BOOTSTRAP_HINT,
    nextSteps: [
      "Create docs/.IA using the bootstrap guide",
      "Add required seed files and commit to Git",
      "Run governance validation again from Mission Control",
    ],
    docsLinks: [
      { label: "Bootstrap `.IA`", path: "docs/governance/operational-ux.md#bootstrap" },
      { label: "Validation pipeline", path: "docs/governance/ia-validation-pipeline.md" },
    ],
  };
}

/**
 * @param {Record<string, unknown>} result
 * @param {{ projectId?: string|null, projectRoot?: string|null, displayName?: string|null }} [ctx]
 * @returns {string}
 */
function formatGovernanceReport(result, ctx = {}) {
  const readiness = resolveExecutionReadiness(result);
  const headline = resolveGovernanceStatusHeadline(result, readiness);
  const summary = buildHumanValidationSummary(result);
  const snap = asSnapshot(result.validationSnapshot);
  const ia = asIaValidation(snap?.iaValidation || result.iaValidation);
  const timeline = buildGovernanceTimeline(result);

  const lines = [
    "=== Setup-Boss — .IA Governance Report ===",
    "",
    ctx.displayName ? `Project: ${ctx.displayName}` : null,
    ctx.projectId ? `projectId: ${ctx.projectId}` : null,
    ctx.projectRoot ? `projectRoot: ${ctx.projectRoot}` : null,
    "",
    `Status: ${headline}`,
    `Execution readiness: ${readiness}`,
    summary,
    "",
    `specVersion: ${result.specVersion || snap?.specVersion || "(n/a)"}`,
    `supportedVersions: ${(result.supportedVersions || SUPPORTED_SPEC_VERSIONS).join(", ")}`,
    `validationDurationMs: ${snap?.validationDurationMs ?? "(n/a)"}`,
    `warnings: ${countWarnings(result)}`,
    `errors: ${countErrors(result)}`,
    "",
    "--- Timeline ---",
    ...timeline.map((t) => {
      const dur = t.durationMs != null ? ` (${t.durationMs}ms)` : "";
      const msg = t.message ? ` — ${t.message}` : "";
      return `${t.label}: ${t.status}${dur}${msg}`;
    }),
    "",
  ].filter((l) => l !== null);

  if (snap?.metrics && typeof snap.metrics === "object") {
    lines.push("--- Performance ---");
    const m = /** @type {Record<string, unknown>} */ (snap.metrics);
    if (m.fileCount != null) lines.push(`files scanned: ${m.fileCount}`);
    if (m.contentLoadMs != null) lines.push(`content load: ${m.contentLoadMs}ms`);
    if (m.pipelineStageMs != null) lines.push(`pipeline stages: ${m.pipelineStageMs}ms`);
    if (m.gitListMs != null) lines.push(`git ls-files: ${m.gitListMs}ms`);
    lines.push("");
  }

  if (Array.isArray(result.suggestedActions) && result.suggestedActions.length) {
    lines.push("--- Suggested actions ---");
    for (const [i, a] of result.suggestedActions.entries()) {
      lines.push(`  ${i + 1}. ${a}`);
    }
    lines.push("");
  }

  if (ia) {
    lines.push("--- iaValidation ---");
    lines.push(JSON.stringify(ia, null, 2));
    lines.push("");
  }

  if (snap) {
    lines.push("--- validationSnapshot ---");
    lines.push(JSON.stringify(snap, null, 2));
  }

  return lines.join("\n");
}

/**
 * @param {Record<string, unknown>} result
 * @param {{ projectId?: string|null, projectRoot?: string|null, displayName?: string|null, validatedAt?: string }} [ctx]
 * @returns {Record<string, unknown>}
 */
function buildGovernanceUxPayload(result, ctx = {}) {
  const readiness = resolveExecutionReadiness(result);
  const snap = asSnapshot(result.validationSnapshot);
  const metrics =
    snap?.metrics && typeof snap.metrics === "object"
      ? /** @type {Record<string, unknown>} */ (snap.metrics)
      : {};

  return {
    ok: result.ok === true,
    readiness,
    headline: resolveGovernanceStatusHeadline(result, readiness),
    summary: buildHumanValidationSummary(result),
    specVersion:
      result.specVersion != null && String(result.specVersion).trim()
        ? String(result.specVersion)
        : snap?.specVersion != null
          ? String(snap.specVersion)
          : null,
    supportedVersions: Array.isArray(result.supportedVersions)
      ? result.supportedVersions.map((v) => String(v))
      : [...SUPPORTED_SPEC_VERSIONS],
    validationDurationMs:
      typeof snap?.validationDurationMs === "number" ? snap.validationDurationMs : null,
    warningsCount: countWarnings(result),
    errorsCount: countErrors(result),
    timeline: buildGovernanceTimeline(result),
    onboarding: buildOnboardingUx(result),
    performance: {
      validationDurationMs:
        typeof snap?.validationDurationMs === "number" ? snap.validationDurationMs : null,
      fileCount: typeof metrics.fileCount === "number" ? metrics.fileCount : null,
      contentLoadMs: typeof metrics.contentLoadMs === "number" ? metrics.contentLoadMs : null,
      gitListMs: typeof metrics.gitListMs === "number" ? metrics.gitListMs : null,
    },
    reportText: formatGovernanceReport(result, ctx),
    validationSnapshot: snap,
    iaValidation: asIaValidation(snap?.iaValidation || result.iaValidation),
    code: result.code ? String(result.code) : null,
    phase: result.phase ? String(result.phase) : null,
    validatedAt: ctx.validatedAt || new Date().toISOString(),
  };
}

module.exports = {
  TIMELINE_STAGES,
  resolveExecutionReadiness,
  resolveGovernanceStatusHeadline,
  buildHumanValidationSummary,
  buildGovernanceTimeline,
  buildOnboardingUx,
  formatGovernanceReport,
  buildGovernanceUxPayload,
  countWarnings,
  countErrors,
};
