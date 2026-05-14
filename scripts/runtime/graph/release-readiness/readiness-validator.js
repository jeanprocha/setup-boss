"use strict";

const { SCHEMA_VERSION, PIPELINE_VARIANT, ARTIFACT_FILENAME } = require("../constants");
const { buildCanonicalExecutionGraph } = require("../graph-builder");
const { computeDeterministicSchedulingOrder } = require("../scheduler/dependency-resolver");
const { computeExecutionGraphFingerprint } = require("../fingerprint");
const {
  validateExecutionGraphDoc,
  hasHardEdgeCycle,
} = require("../graph-validation");
const { RUNTIME_ARTIFACT_FILENAME } = require("../runtime-state/constants");
const { SCHEDULER_ARTIFACT_FILENAME } = require("../scheduler/constants");
const { OVERLAY_ARTIFACT_FILENAME } = require("../overlay/constants");
const { NODE_ADAPTERS_ARTIFACT_FILENAME } = require("../node-adapters/constants");
const { REPLAY_ARTIFACT_FILENAME } = require("../replay/constants");
const { RISK_ARTIFACT_FILENAME } = require("../risk/constants");
const { tryReadJsonFile } = require("./safe-json");
const { auditArtifacts } = require("./artifact-auditor");
const { auditFeatureFlags } = require("./flag-auditor");
const {
  validateShadowModuleBoundary,
  validateReportAdvisoryContracts,
  validateSchedulerAdvisorySemantics,
  observabilityReadOnlyDeclaration,
} = require("./integration-validator");
const { consolidateDiagnostics } = require("./diagnostics-consolidator");
const { RELEASE_STATUS } = require("./constants");

function fpFromExecutionGraphDoc(doc) {
  if (!doc) return null;
  return doc.graph_fingerprint_sha256 || doc.graph_fingerprint || null;
}

function alignFingerprint(label, artifactFp, canonicalFp) {
  if (!artifactFp) return { label, status: "missing" };
  if (!canonicalFp) return { label, status: "unknown" };
  return {
    label,
    status: artifactFp === canonicalFp ? "aligned" : "mismatch",
    artifact: artifactFp,
    canonical: canonicalFp,
  };
}

/**
 * @param {{
 *   outputDir: string,
 *   runId: string,
 *   env?: NodeJS.ProcessEnv,
 * }} opts
 */
function validateExecutionGraphReleaseReadiness(opts) {
  const outputDir = String(opts.outputDir || "");
  const runId = String(opts.runId || "");
  const env = opts.env || process.env;

  const warnings = /** @type {string[]} */ ([]);
  const blockers = /** @type {string[]} */ ([]);

  const structural = buildCanonicalExecutionGraph();
  const canonicalFp = computeExecutionGraphFingerprint(structural);
  const graphId = `graph_${canonicalFp.slice(0, 32)}`;
  const topo = computeDeterministicSchedulingOrder(structural);

  const eg = tryReadJsonFile(outputDir, ARTIFACT_FILENAME);
  const rt = tryReadJsonFile(outputDir, RUNTIME_ARTIFACT_FILENAME);
  const sch = tryReadJsonFile(outputDir, SCHEDULER_ARTIFACT_FILENAME);
  const ov = tryReadJsonFile(outputDir, OVERLAY_ARTIFACT_FILENAME);
  const na = tryReadJsonFile(outputDir, NODE_ADAPTERS_ARTIFACT_FILENAME);
  const rp = tryReadJsonFile(outputDir, REPLAY_ARTIFACT_FILENAME);
  const rk = tryReadJsonFile(outputDir, RISK_ARTIFACT_FILENAME);

  const artifact_audit = auditArtifacts(outputDir);
  for (const pe of artifact_audit.parse_errors) warnings.push(`artifact: ${pe}`);

  if (!eg.ok) warnings.push("execution-graph.json ausente ou ilegível — readiness parcial");
  else {
    const v = validateExecutionGraphDoc(eg.data);
    if (!v.ok) {
      for (const err of v.errors) blockers.push(`execution-graph inválido: ${err}`);
    }
    if (hasHardEdgeCycle({ nodes: eg.data.nodes || [], edges: eg.data.edges || [] })) {
      blockers.push("ciclo em arestas hard no execution-graph persistido");
    }
  }

  const fingerprint_alignments = [
    alignFingerprint("execution_graph", eg.ok ? fpFromExecutionGraphDoc(eg.data) : null, canonicalFp),
    alignFingerprint(
      "runtime",
      rt.ok ? rt.data.graph_fingerprint : null,
      canonicalFp,
    ),
    alignFingerprint(
      "scheduler",
      sch.ok ? sch.data.graph_fingerprint : null,
      canonicalFp,
    ),
    alignFingerprint(
      "overlay",
      ov.ok ? ov.data.graph_fingerprint : null,
      canonicalFp,
    ),
    alignFingerprint(
      "node_adapters",
      na.ok ? na.data.graph_fingerprint : null,
      canonicalFp,
    ),
    alignFingerprint(
      "replay",
      rp.ok ? rp.data.graph_fingerprint : null,
      canonicalFp,
    ),
    alignFingerprint(
      "risk",
      rk.ok ? rk.data.graph_fingerprint : null,
      canonicalFp,
    ),
  ];

  for (const row of fingerprint_alignments) {
    if (row.status === "mismatch") blockers.push(`fingerprint mismatch: ${row.label}`);
  }

  let deterministic_orders_match = null;
  if (sch.ok && ov.ok) {
    const schOrder = sch.data.deterministic_order || [];
    const ovOrder = ov.data.graph_deterministic_order || [];
    deterministic_orders_match =
      JSON.stringify(schOrder) === JSON.stringify(ovOrder) &&
      JSON.stringify(ovOrder) === JSON.stringify(topo);
    if (!deterministic_orders_match) {
      blockers.push("deterministic order: scheduler vs overlay vs topo canónico inconsistente");
    }
  } else if (sch.ok || ov.ok) {
    deterministic_orders_match = null;
    warnings.push("scheduler ou overlay ausente — ordem determinística não cruzada");
  } else {
    warnings.push("scheduler e overlay ausentes — sem validação cruzada de ordem");
  }

  const integration_shadow = validateShadowModuleBoundary();
  const integration_reports = validateReportAdvisoryContracts(
    rp.ok ? rp.data : null,
    rk.ok ? rk.data : null,
    ov.ok ? ov.data : null,
  );
  const integration_scheduler = validateSchedulerAdvisorySemantics(sch.ok ? sch.data : null);

  if (!integration_shadow.ok) blockers.push(...integration_shadow.hits.map((h) => `shadow boundary: ${h}`));
  if (!integration_reports.ok) blockers.push(...integration_reports.violations.map((v) => `integration: ${v}`));
  if (!integration_scheduler.ok) blockers.push(...integration_scheduler.notes);

  const feature_flag_audit = auditFeatureFlags(env);
  if (feature_flag_audit.invalid_mode_flags.length) {
    blockers.push(
      `flags com modo inválido (só off|shadow): ${feature_flag_audit.invalid_mode_flags.join(", ")}`,
    );
  }

  const obs = observabilityReadOnlyDeclaration();

  const compatibility_audit = {
    canonical_schema_version: SCHEMA_VERSION,
    canonical_pipeline_variant: PIPELINE_VARIANT,
    graph_id_expected: graphId,
    pipeline_backward_compatible:
      structural.schema_version === SCHEMA_VERSION && structural.pipeline_variant === PIPELINE_VARIANT,
  };
  if (!compatibility_audit.pipeline_backward_compatible) {
    blockers.push("grafo canónico diverge de SCHEMA_VERSION / PIPELINE_VARIANT esperados");
  }

  const consistency_audit = {
    fingerprint_alignments,
    deterministic_orders_match,
    canonical_fingerprint_sha256: canonicalFp,
    scheduling_order_canonical: topo,
    scheduler_advisory: integration_scheduler,
    observability: obs,
  };

  const integration_audit = {
    shadow_module_boundary: integration_shadow,
    advisory_reports: integration_reports,
    scheduler_semantics: integration_scheduler,
    orchestration_independent: {
      note: "orchestration.js não integra DAG (validação estática nos testes).",
    },
  };

  const validated_components = [
    { component: "graph_model", status: eg.ok ? "ok" : "skipped", detail: eg.ok ? "execution-graph legível" : "ausente" },
    {
      component: "runtime_state",
      status: rt.ok ? "ok" : "skipped",
      detail: rt.ok ? "execution-graph-runtime presente" : "ausente",
    },
    {
      component: "scheduler",
      status: sch.ok ? "ok" : "skipped",
      detail: sch.ok ? "relatório advisory presente" : "ausente",
    },
    { component: "overlay", status: ov.ok ? "ok" : "skipped", detail: ov.ok ? "overlay presente" : "ausente" },
    {
      component: "node_adapters",
      status: na.ok ? "ok" : "skipped",
      detail: na.ok ? "adapters presentes" : "ausente",
    },
    { component: "replay", status: rp.ok ? "ok" : "skipped", detail: rp.ok ? "replay advisory presente" : "ausente" },
    { component: "risk", status: rk.ok ? "ok" : "skipped", detail: rk.ok ? "risk read-only presente" : "ausente" },
    {
      component: "observability",
      status: "ok",
      detail: obs.note,
    },
    {
      component: "release_readiness",
      status: "ok",
      detail: "validator interno",
    },
  ];

  const diagnostics = consolidateDiagnostics({
    scheduler: sch.ok ? sch.data : null,
    overlay: ov.ok ? ov.data : null,
    replay: rp.ok ? rp.data : null,
    risk: rk.ok ? rk.data : null,
    runtime: rt.ok ? rt.data : null,
  });

  if (rp.ok && rp.data.compat && rp.data.compat.repeat_edges_policy) {
    if (String(rp.data.compat.repeat_edges_policy).toLowerCase().includes("oper")) {
      blockers.push("replay: repeat_edges_policy não pode tornar-se operacional");
    }
  }

  if (eg.ok && runId && eg.data.run && eg.data.run.run_id && String(eg.data.run.run_id) !== runId) {
    warnings.push("run_id no execution-graph difere do runId fornecido");
  }

  let release_status = RELEASE_STATUS.READY;
  if (blockers.length) release_status = RELEASE_STATUS.BLOCKED;
  else if (warnings.length || artifact_audit.missing.length > 3) release_status = RELEASE_STATUS.WARNING;
  else if (!eg.ok || !sch.ok || !ov.ok) release_status = RELEASE_STATUS.WARNING;

  const readiness_summary = {
    release_status,
    blockers_count: blockers.length,
    warnings_count: warnings.length,
    artifacts_present: artifact_audit.present_count,
    fingerprint_ok: !fingerprint_alignments.some((x) => x.status === "mismatch"),
    advisory_only_integrity: integration_reports.ok && integration_scheduler.ok,
  };

  return {
    release_status,
    readiness_summary,
    validated_components,
    artifact_audit,
    feature_flag_audit,
    integration_audit,
    consistency_audit,
    compatibility_audit,
    diagnostics,
    warnings,
    blockers,
    graph_id: graphId,
    graph_fingerprint: canonicalFp,
  };
}

module.exports = {
  validateExecutionGraphReleaseReadiness,
  fpFromExecutionGraphDoc,
};
