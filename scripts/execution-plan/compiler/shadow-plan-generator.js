/**
 * Geração shadow do Execution Plan a partir da saída do Architect (Fase 4.1).
 * Não altera o executor — apenas deriva um IR persistido para observabilidade.
 */

const crypto = require("crypto");
const {
  EXECUTION_PLAN_SCHEMA_VERSION,
  PLAN_LIFECYCLE_STATE,
  PLAN_OPERATION_TYPE,
  PLAN_OPERATION_MODE,
} = require("../schema/constants");
const { extractSection } = require("../../shared-utils");

function isoNow() {
  return new Date().toISOString();
}

function slugOpId(index) {
  const n = String(index + 1).padStart(4, "0");
  return `op-${n}`;
}

function splitPlanBullets(planMd) {
  const lines = String(planMd || "")
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean);
  const steps = [];
  for (const line of lines) {
    const cleaned = line.replace(/^[-*]\s*/, "").replace(/^`\s*|\s*`$/g, "").trim();
    if (!cleaned || cleaned.startsWith("#")) continue;
    steps.push(cleaned.slice(0, 2000));
    if (steps.length >= 48) break;
  }
  return steps;
}

function makePlanId(runId, revisionId) {
  const h = crypto
    .createHash("sha256")
    .update(`sb-plan|${runId}|${revisionId}`, "utf8")
    .digest("hex")
    .slice(0, 24);
  return `sb-plan:${runId}:${h}`;
}

/**
 * @param {{
 *   runId: string,
 *   runContext: object,
 *   architectOutputMd: string,
 *   metadata?: object|null,
 * }} input
 */
function generateShadowExecutionPlanDraft(input) {
  const runId = String(input.runId || "").trim();
  const runContext = input.runContext && typeof input.runContext === "object"
    ? input.runContext
    : {};
  const revisionId = `${runId}-rev-1`;
  const lineageId = runId;
  const planId = makePlanId(runId, revisionId);

  const architect = runContext.architect && typeof runContext.architect === "object"
    ? runContext.architect
    : {};
  const task = runContext.task && typeof runContext.task === "object" ? runContext.task : {};

  const allowedRaw = Array.isArray(architect.allowed_files) ? architect.allowed_files : [];
  const allowed_files = [...new Set(allowedRaw.map((x) => String(x).replace(/\\/g, "/")))];

  const planSection = extractSection(String(input.architectOutputMd || ""), "Plano");
  const bullets = splitPlanBullets(planSection);
  if (bullets.length === 0 && architect.plan_summary) {
    bullets.push(String(architect.plan_summary).slice(0, 1800));
  }

  const operations = [];
  let idx = 0;

  for (const rel of allowed_files) {
    operations.push({
      operation_id: slugOpId(idx),
      type: PLAN_OPERATION_TYPE.FILE_SCOPE,
      mode: PLAN_OPERATION_MODE.SHADOW_DERIVED,
      target: "repository_relative_file",
      file: rel,
      search: null,
      replace: null,
      reasoning:
        "Âmbito derivado de `run-context.json` / Architect — ficheiro candidato a PATCH no executor legado.",
      dependencies: [],
      risk_level: "unknown",
      metadata: { source: "architect.allowed_files" },
      extensions: {},
    });
    idx += 1;
  }

  let prevId = null;
  for (const text of bullets) {
    const oid = slugOpId(idx);
    operations.push({
      operation_id: oid,
      type: PLAN_OPERATION_TYPE.ARCHITECT_PLAN_STEP,
      mode: PLAN_OPERATION_MODE.INFORMATIONAL,
      target: "task_plan_narrative",
      file: null,
      search: null,
      replace: null,
      reasoning: text,
      dependencies: prevId ? [prevId] : [],
      risk_level: "informational",
      metadata: { source: "architect-output.md##Plano" },
      extensions: {},
    });
    prevId = oid;
    idx += 1;
  }

  operations.push({
    operation_id: slugOpId(idx),
    type: PLAN_OPERATION_TYPE.MARKER_NO_PATCH_YET,
    mode: PLAN_OPERATION_MODE.INFORMATIONAL,
    target: "executor_contract",
    file: null,
    search: null,
    replace: null,
    reasoning:
      "Shadow mode: o executor oficial continua a ser o motor PATCH existente; este plano não aplica mudanças nem substitui executor-changes.",
    dependencies: [],
    risk_level: "n/a",
    metadata: { enforcement: false },
    extensions: {},
  });

  const intent = {
    summary: architect.plan_summary != null ? String(architect.plan_summary) : "",
    task_path: task.path != null ? String(task.path) : "",
    task_title: task.title != null ? String(task.title) : "",
    acceptance_criteria_refs: Array.isArray(task.acceptance_criteria)
      ? task.acceptance_criteria.slice(0, 24).map((x) => String(x).slice(0, 400))
      : [],
    extensions: {},
  };

  const risk_hints = {
    architect_risks: Array.isArray(architect.risks) ? architect.risks.slice(0, 24) : [],
    stop_criteria: Array.isArray(architect.stop_criteria)
      ? architect.stop_criteria.slice(0, 16)
      : [],
    scan_skipped:
      runContext.execution_context &&
      typeof runContext.execution_context === "object"
        ? Boolean(runContext.execution_context.scan_skipped)
        : null,
    extensions: {},
  };

  const execution_strategy = {
    kind: "LEGACY_PATCH_EXECUTOR",
    executor_engine: "patch",
    plan_mode: "shadow",
    enforcement: false,
    notes:
      "Fase 4.1 — IR apenas observacional; correção/review/replay legados permanecem inchados.",
    extensions: {},
  };

  const revision_lineage = {
    lineage_id: lineageId,
    revision_ids: [revisionId],
    extensions: {},
  };

  const revisions = [
    {
      revision_id: revisionId,
      parent_revision_id: null,
      created_at: isoNow(),
      fingerprint_sha256: null,
      extensions: {},
    },
  ];

  return {
    schema_version: EXECUTION_PLAN_SCHEMA_VERSION,
    plan_id: planId,
    run_id: runId,
    revision_id: revisionId,
    parent_revision_id: null,
    lineage_id: lineageId,
    generated_at: isoNow(),
    generated_by: {
      component: "shadow-plan-generator",
      phase: "4.1",
      plan_mode: "shadow",
      extensions: {},
    },
    lifecycle_state: PLAN_LIFECYCLE_STATE.DRAFT,
    lifecycle_transitions: [],
    lifecycle_updated_at: null,
    intent,
    operations,
    allowed_files,
    metadata: {
      run_context_version: runContext.version != null ? String(runContext.version) : null,
      shadow: true,
      extensions: {},
    },
    fingerprints: {
      plan_content_sha256: null,
      structural_inputs_sha256: null,
      extensions: {},
    },
    telemetry: {
      events: [],
      extensions: {},
    },
    execution_strategy,
    validation: {
      last_structural: null,
      extensions: {},
    },
    risk_hints,
    extensions: {},
    revision_lineage,
    revisions,
  };
}

module.exports = {
  generateShadowExecutionPlanDraft,
};
