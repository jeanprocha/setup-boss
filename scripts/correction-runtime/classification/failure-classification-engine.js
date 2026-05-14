/**
 * Failure classification engine — etiquetas estruturais replay-safe (heurísticas determinísticas).
 */

const crypto = require("crypto");
const { sha256HexOfObject } = require("../lib/stable-stringify");
const {
  validationFailed,
  riskTierCritical,
} = require("../../review-runtime/invariants/validation-invariant");

function uniq(arr) {
  return [...new Set((arr || []).map((x) => String(x)))];
}

function pickConfidence(base, deltas) {
  const c = Math.min(1, Math.max(0, base + (deltas || 0)));
  return Math.round(c * 1000) / 1000;
}

function buildExecutorFailureEvidence(snapshot, ex) {
  const ev = [];
  if (!ex) {
    ev.push("executor-result.json ausente");
    return ev;
  }
  if (ex.status && String(ex.status).toLowerCase() !== "success") {
    ev.push(`executor status=${ex.status}`);
  }
  if (ex.error && typeof ex.error === "string") ev.push(ex.error.slice(0, 500));
  if (Array.isArray(snapshot.executor_changes) && snapshot.executor_changes.length === 0) {
    ev.push("executor_changes vazio — possível falha antes de PATCH");
  }
  return ev;
}

function subclassifyValidation(valRes) {
  const subtypes = [];
  const evidence = [];
  let confidence = 0.45;
  const summary =
    valRes && valRes.summary && typeof valRes.summary === "object" ? valRes.summary : valRes || {};
  if (validationFailed(summary)) {
    confidence = 0.72;
    const failed = summary.failed_validators;
    const executed = summary.executed_validators;
    if (typeof executed === "number" && executed === 0) {
      subtypes.push("tooling");
      evidence.push("Nenhum validator executado (tooling/skipped graph?)");
      confidence -= 0.05;
    }
    const st = summary.status ? String(summary.status).toLowerCase() : "";
    if (st === "timeout" || String(summary.abort_reason || "").toLowerCase().includes("timeout")) {
      subtypes.push("timeout");
      evidence.push("Timeout no validation runtime.");
      confidence = 0.78;
    }
    if (
      summary.failures_detail &&
      Array.isArray(summary.failures_detail) &&
      summary.failures_detail.some((f) => String(f.validator_type || "").includes("semantic"))
    ) {
      subtypes.push("semantic");
      evidence.push("Falhas reportadas incluem validação semântica.");
    }
    if (!subtypes.includes("semantic") && !subtypes.includes("timeout")) subtypes.push("syntax");
    if (typeof failed === "number") evidence.push(`failed_validators=${failed}`);
  }
  return {
    subtype: subtypes[0] || "syntax",
    subtypes_hint: uniq(subtypes),
    evidence,
    confidence: pickConfidence(confidence),
  };
}

function subclassifyStructural(violations, snapshot) {
  const items = [];
  const ids = uniq((violations || []).map((v) => v.id));
  for (const id of ids) {
    let subtype = "invariants";
    const low = String(id || "").toLowerCase();
    if (low.includes("lifecycle")) subtype = "lifecycle";
    else if (low.includes("artifact") || low.includes("manifest")) subtype = "manifests";
    else if (low.includes("replay")) subtype = "replay mismatch";
    const inv = Array.isArray(violations)
      ? violations.find((x) => x.id === id)
      : null;
    items.push({
      id,
      subtype,
      confidence: pickConfidence(inv && inv.severity === "critical" ? 0.86 : 0.72),
      evidence: Array.isArray(inv && inv.evidence) ? inv.evidence.slice(0, 5) : [],
      probable_causes: [`Invariante estrutural ${id} falhou sob snapshot actual.`],
      remediation_hints:
        Array.isArray(inv && inv.remediation_hints) && inv.remediation_hints.length
          ? inv.remediation_hints.slice(0, 10)
          : [`Reconciliar causa de ${id} antes de novo PATCH.`],
    });
  }

  const missingPlan = !snapshot.plan || typeof snapshot.plan !== "object";
  if (missingPlan) {
    items.push({
      id: "structural.manifest.missing_execution_plan",
      subtype: "manifests",
      confidence: pickConfidence(0.7),
      evidence: ["execution-plan.json não presente ou inválido no snapshot"],
      probable_causes: ["Plano não compilado nesta pasta de run."],
      remediation_hints: ["Regenerar plano ou reexecutar fase architect/plan persistence."],
    });
  }

  return items;
}

function subclassifyReconciliation(recon) {
  const out = [];
  if (!recon) return out;
  if (recon.status === "divergent") {
    out.push({
      id: "reconciliation.unexpected_changes",
      subtype: "unexpected changes",
      confidence: pickConfidence(0.8),
      evidence: [
        ...(Array.isArray(recon.evidence_messages) ? recon.evidence_messages.slice(0, 6).map(String) : []),
        `status=divergent unexpected=${recon.unexpected_changes || 0} orphan=${recon.orphan_operations || 0}`,
      ],
      probable_causes: ["executor divergiu vs plan operations"],
      remediation_hints: ["Auditar reconciliation.json e PATCH manifest antes de novo retry."],
    });
  }
  if (
    Number(recon.orphan_operations || 0) > 0 &&
    recon.status !== "divergent"
  ) {
    out.push({
      id: "reconciliation.orphan_operations",
      subtype: "orphan operations",
      confidence: pickConfidence(0.65),
      evidence: [`orphan_operations=${recon.orphan_operations}`],
      probable_causes: ["operações executadas não mapeadas no plan"],
      remediation_hints: ["Filtrar operações orphan e alinhar plan."],
    });
  }
  return out;
}

function subclassifySemantic(semanticReview) {
  const out = [];
  if (!semanticReview || semanticReview.skipped) return out;
  const score = semanticReview.semantic_score;
  if (typeof score === "number" && score < 70) {
    out.push({
      id: "semantic.low_score",
      subtype: "maintainability",
      confidence: pickConfidence(Math.min(0.9, 0.55 + (70 - score) / 200)),
      evidence: [`semantic_score=${score}`],
      probable_causes: ["Heurísticas semânticas abaixo do limiar de correção automática"],
      remediation_hints: ["Reestruturação menor com escopo preservado segundo review-results findings."],
    });
  }
  const findings = Array.isArray(semanticReview.findings) ? semanticReview.findings : [];
  for (const f of findings.slice(0, 20)) {
    const cat = String(f.category || "").toLowerCase();
    let subtype = "maintainability";
    if (cat.includes("arch")) subtype = "architecture drift";
    if (cat.includes("intent")) subtype = "intent mismatch";
    out.push({
      id: String(f.id || "semantic.finding"),
      subtype,
      confidence: pickConfidence(0.62),
      evidence: [String(f.detail || f.message || "").slice(0, 400)],
      probable_causes: [String(f.reason || "") || "finding semântico"],
      remediation_hints: f.hint ? [String(f.hint)] : [],
    });
  }
  return out;
}

function subclassifyRuntime(snapshot) {
  const ra = snapshot.risk_analysis ? snapshot.risk_analysis : null;
  const sum =
    ra && ra.summary && typeof ra.summary === "object" ? ra.summary : typeof ra === "object" ? ra : null;
  const items = [];

  const instab =
    snapshot.metadata &&
    snapshot.metadata.prompt_metrics &&
    snapshot.metadata.prompt_metrics.correction_loop
      ? snapshot.metadata.prompt_metrics.correction_loop
      : null;

  const metaCorr =
    snapshot.metadata &&
    snapshot.metadata.execution &&
    typeof snapshot.metadata.execution.correction_iterations === "number"
      ? snapshot.metadata.execution.correction_iterations
      : snapshot.metadata &&
          snapshot.metadata.run_log &&
          typeof snapshot.metadata.run_log.correction_iterations === "number"
        ? snapshot.metadata.run_log.correction_iterations
        : 0;

  if (riskTierCritical(sum)) {
    items.push({
      id: "runtime.risk_tier_critical",
      subtype: "orchestration",
      confidence: pickConfidence(0.74),
      evidence: ["risk tier crítico no runtime"],
      probable_causes: ["propagação multi-camada de risco"],
      remediation_hints: ["Reduzir escopo PATCH e validação focal segundo risk-analysis targets."],
    });
  }

  if (typeof metaCorr === "number" && metaCorr >= 2) {
    items.push({
      id: "runtime.correction_pressure",
      subtype: "orchestration",
      confidence: pickConfidence(0.68),
      evidence: [`correction_iterations_hint=${metaCorr}`],
      probable_causes: ["instabilidade de pipeline / loop de revisão repetido"],
      remediation_hints: ["Parar retrys amplos — usar remediation targeting pontual."],
    });
  }

  if (
    snapshot.validation_runtime_manifest &&
    snapshot.validation_runtime_manifest.cache &&
    snapshot.validation_runtime_manifest.cache.inconsistent === true
  ) {
    items.push({
      id: "runtime.cache_inconsistency_validation",
      subtype: "cache inconsistency",
      confidence: pickConfidence(0.7),
      evidence: ["validation-runtime-manifest sinaliza cache inconsistente"],
      probable_causes: ["stale caching entre targets e resultados"],
      remediation_hints: ["Invalidar validation-runtime-cache antes de rerun."],
    });
  }

  if (instab && typeof instab.iterations === "number" && instab.iterations >= 2) {
    items.push({
      id: "runtime.correction_prompt_loop",
      subtype: "orchestration",
      confidence: pickConfidence(0.66),
      evidence: [`prompt_metrics.correction_loop.iterations=${instab.iterations}`],
      probable_causes: ["múltiplas passagens orchestration-correction"],
      remediation_hints: ["Inspeccionar review bloqueadores persistentes"],
    });
  }

  return items;
}

function subclassifyExecutor(snapshot) {
  const ex = snapshot.executor_result || null;
  const items = [];

  const hasErrors =
    snapshot.executor_changes &&
    Array.isArray(snapshot.executor_changes) &&
    snapshot.executor_changes.some((op) =>
      Boolean(op && (op.failed === true || (op.results && Array.isArray(op.results) && op.results.some((r) => r && r.failed)))),
    );

  if (
    snapshot.executor_output_excerpt &&
    /patch mismatch|insufficient snippet|apply failed/i.test(snapshot.executor_output_excerpt)
  ) {
    const low = snapshot.executor_output_excerpt.toLowerCase();
    let subtype = "apply failure";
    if (low.includes("patch mismatch")) subtype = "patch mismatch";
    if (low.includes("snippet")) subtype = "insufficient snippet";

    items.push({
      id: `executor.keyword.${subtype.replace(/\s+/g, "_")}`,
      subtype,
      confidence: pickConfidence(0.77),
      evidence: ["substring em executor-output.md"],
      probable_causes: ["Output executor indica falha de PATCH"],
      remediation_hints: ["Reposicionar snippet / alinhar path segundo patch-manifest."],
    });
  }

  if (hasErrors || (ex && String(ex.status).toLowerCase() !== "success")) {
    items.push({
      id: "executor.failure_or_partial",
      subtype: hasErrors ? "apply failure" : "apply failure",
      confidence: pickConfidence(0.7),
      evidence: buildExecutorFailureEvidence(snapshot, ex),
      probable_causes: ["Executor não aplicou todas as operações esperadas"],
      remediation_hints: ["Reexecutar com correção dirigida apenas às operações marcadas falhadas"],
    });
  }

  return items;
}

/**
 * Classifica todas as falhas observáveis a partir do snapshot + review-determinístico (se existir).
 * @returns {{ classifications: Array<object>, failures: Array<object> }}
 */
function classifyFailures({ snapshot, reviewResults, correctionHints }) {
  const failures = [];

  const violations = Array.isArray(reviewResults && reviewResults.violations) ? reviewResults.violations : [];

  const structuralPieces = subclassifyStructural(violations, snapshot);
  if (structuralPieces.length)
    failures.push({
      classification: "structural_failure",
      items: structuralPieces,
    });

  const valRes = snapshot.validation_results || null;
  if (validationFailed(valRes ? valRes.summary : null)) {
    const v = subclassifyValidation(valRes || {});
    failures.push({
      classification: "validation_failure",
      items: [
        {
          id: "validation.runtime.summary",
          subtype: v.subtype,
          confidence: v.confidence,
          evidence: v.evidence.filter(Boolean),
          probable_causes: ["Validação tooling ou project scripts falhou"],
          remediation_hints: correctionHints && correctionHints.validation_fix_required
            ? ["Obedecer correction_hints.validation_fix_required (targets em validation-graph)"]
            : ["Rodar apenas validators marcados FAILED no validation-results.json"],
        },
      ],
    });
  }

  const reconPieces = subclassifyReconciliation(snapshot.reconciliation);
  if (reconPieces.length)
    failures.push({
      classification: "reconciliation_failure",
      items: reconPieces,
    });

  const sem =
    reviewResults && reviewResults.semantic_review && typeof reviewResults.semantic_review === "object"
      ? reviewResults.semantic_review
      : {};

  const semPieces = subclassifySemantic(sem);
  if (semPieces.length)
    failures.push({
      classification: "semantic_failure",
      items: semPieces,
    });

  const runPieces = subclassifyRuntime(snapshot);
  if (runPieces.length)
    failures.push({
      classification: "runtime_failure",
      items: runPieces,
    });

  const exePieces = subclassifyExecutor(snapshot);
  if (exePieces.length)
    failures.push({
      classification: "executor_failure",
      items: exePieces,
    });

  if (
    correctionsHintsFormal(correctionHints) &&
    reviewResults &&
    reviewResults.summary &&
    reviewResults.summary.requires_correction === true
  ) {
    amplifyFailuresWithCorrectionHints(failures, correctionHints);
  }

  return {
    classifications: summarizeBuckets(failures),
    failures,
  };
}

function correctionsHintsFormal(h) {
  if (!h || typeof h !== "object") return false;
  return Boolean(
    h.reconciliation_fix_required ||
      h.validation_fix_required ||
      h.semantic_fix_required ||
      (Array.isArray(h.invariant_violation_targets) && h.invariant_violation_targets.length),
  );
}

function amplifyFailuresWithCorrectionHints(failures, correctionHints) {
  function ensureBucket(name) {
    let b = failures.find((x) => x.classification === name);
    if (!b) {
      b = { classification: name, items: [] };
      failures.push(b);
    }
    return b;
  }

  const invSeen = new Set();

  function pushDedup(bucket, item) {
    const key = stableItemKey(bucket.classification, item);
    if (invSeen.has(key)) return;
    invSeen.add(key);
    bucket.items.push(item);
  }

  if (Array.isArray(correctionHints.invariant_violation_targets)) {
    const b = ensureBucket("structural_failure");
    for (const id of correctionHints.invariant_violation_targets.slice(0, 40)) {
      pushDedup(b, {
        id: `hint.invariant.${id}`,
        subtype: "invariants",
        confidence: pickConfidence(0.73),
        evidence: [`correction_hints.invariant_violation_targets:${id}`],
        probable_causes: ["review etiquetou invariante falhante"],
        remediation_hints: ["Priorizar reconcile deste invariante antes de PATCH amplo"],
      });
    }
  }

  if (correctionHints.reconciliation_fix_required) {
    pushDedup(ensureBucket("reconciliation_failure"), {
      id: "hint.reconciliation_fix_required",
      subtype: "divergence",
      confidence: pickConfidence(0.78),
      evidence: ["correction_hints.reconciliation_fix_required=true"],
      probable_causes: ["snapshot divergente face ao plan"],
      remediation_hints: ["Audit reconciliation + patch-manifest"],
    });
  }

  if (correctionHints.validation_fix_required) {
    pushDedup(ensureBucket("validation_failure"), {
      id: "hint.validation_fix_required",
      subtype: "tooling",
      confidence: pickConfidence(0.75),
      evidence: ["correction_hints.validation_fix_required=true"],
      probable_causes: ["validação obrigou correção tooling"],
      remediation_hints: ["Reexecutar stage falhado apenas (validation-graph)"],
    });
  }

  if (correctionHints.semantic_fix_required) {
    pushDedup(ensureBucket("semantic_failure"), {
      id: "hint.semantic_fix_required",
      subtype: "intent mismatch",
      confidence: pickConfidence(0.6),
      evidence: ["correction_hints.semantic_fix_required=true"],
      probable_causes: ["intent vs entrega segundo heurísticas semânticas"],
      remediation_hints: ["Ajuste local mantendo critérios de acceptance"],
    });
  }

  const policyHints = correctionHints.policy_escalations || [];
  for (const pe of Array.isArray(policyHints) ? policyHints.slice(0, 15) : []) {
    pushDedup(ensureBucket("runtime_failure"), {
      id: `hint.policy.${shaShort(pe)}`,
      subtype: "orchestration",
      confidence: pickConfidence(0.55),
      evidence: [String(pe).slice(0, 480)],
      probable_causes: ["políticas de review sugeriram escalação"],
      remediation_hints: [String(pe).slice(0, 480)],
    });
  }
}

function shaShort(msg) {
  return crypto.createHash("sha256").update(String(msg)).digest("hex").slice(0, 10);
}

function stableItemKey(cls, item) {
  return sha256HexOfObject({
    classification: cls,
    id: item.id,
    subtype: item.subtype,
    evidence_preview: JSON.stringify(item.evidence || []).slice(0, 80),
  });
}

function summarizeBuckets(groups) {
  const map = {};
  for (const g of groups || []) map[g.classification] = (map[g.classification] || 0) + (g.items || []).length;
  return Object.keys(map).sort().map((k) => ({
    classification: k,
    observed_items: map[k],
  }));
}

module.exports = { classifyFailures };
