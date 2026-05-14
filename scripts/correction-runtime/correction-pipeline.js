/**
 * Pipeline principal Correction Runtime V2 — best-effort, nunca quebra fluxo legacy.
 */

const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const { collectRuntimeSnapshot } = require("../review-runtime/lib/runtime-snapshot");
const {
  REVIEW_RESULTS_FILENAME,
  REVIEW_CORRECTION_HINTS_FILENAME,
} = require("../review-runtime/constants");
const { classifyFailures } = require("./classification/failure-classification-engine");
const { computeFailureSignature } = require("./signatures/failure-signatures");
const { prioritizedRemediationTargets, describeRetryScope } = require("./remediation/targeted-remediation-engine");
const { loadCorrectionMemory, persistCorrectionMemory, bumpSignatureStats } = require("./memory/memory-store");
const {
  computeAdaptiveDecision,
  computeNextStreakForGate,
  finalizeMemoryAfterGate,
} = require("./orchestration/adaptive-correction-orchestrator");
const { getCorrectionPolicies } = require("./policies/correction-policies");
const {
  SCHEMA_VERSION_ANALYSIS,
  CORRECTION_ANALYSIS_FILENAME,
  CORRECTION_RUNTIME_TELEMETRY_LOG,
  CORRECTION_SEMANTIC_PROPAGATION_MANIFEST_REF,
  CORRECTION_SEMANTIC_MUTATION_GRAPH_REF,
  CORRECTION_SEMANTIC_PROPAGATION_ARTIFACT,
} = require("./constants");
const {
  appendLineageNode,
  persistLineage,
  loadLineage,
  emptyLineage,
} = require("./lineage/lineage-store");
const { buildCorrectionRuntimeManifest, writeManifestToDisk } = require("./manifests/correction-manifest");
const { emitCorrectionTelemetry } = require("./telemetry/correction-telemetry");
const { sha256HexOfObject } = require("./lib/stable-stringify");
const {
  isCorrectionIntelligenceEnabled,
  isAdaptiveCorrectionOrchestrationEnabled,
  getSemanticCorrectionPropagationModeFromEnv,
} = require("./feature-flags");
const { buildSemanticCorrectionPropagationBlock } = require("./semantic-correction-propagation");

function readJson(abs) {
  try {
    if (!fs.existsSync(abs)) return null;
    return JSON.parse(fs.readFileSync(abs, "utf-8"));
  } catch (_) {
    return null;
  }
}

function createNdjsonSink(outputDir) {
  const p = path.join(String(outputDir || ""), CORRECTION_RUNTIME_TELEMETRY_LOG);
  return {
    appendNdjson(body) {
      fs.mkdirSync(path.dirname(p), { recursive: true });
      fs.appendFileSync(`${p}`, `${JSON.stringify(body)}\n`, "utf-8");
    },
  };
}

function mergePlanArtifactsCorrectionRuntime(outputDir, opts = {}) {
  const semanticPropagationShadow = Boolean(opts && opts.semanticPropagationShadow);
  try {
    const pArt = path.join(outputDir, "plan-artifacts.json");
    if (!fs.existsSync(pArt)) return;
    const merged = JSON.parse(fs.readFileSync(pArt, "utf-8"));
    merged.artifacts = merged.artifacts || {};
    merged.artifacts.extensions = merged.artifacts.extensions || {};
    merged.artifacts.extensions.correction_runtime = {
      correction_analysis: CORRECTION_ANALYSIS_FILENAME,
      correction_runtime_manifest: "correction-runtime-manifest.json",
      correction_memory: "correction-memory/correction-memory.json",
      correction_lineage: "correction-lineage.json",
      correction_telemetry_ndjson: CORRECTION_RUNTIME_TELEMETRY_LOG,
      ...(semanticPropagationShadow
        ? { correction_semantic_propagation: CORRECTION_SEMANTIC_PROPAGATION_ARTIFACT }
        : {}),
    };
    merged.artifacts.generated = merged.artifacts.generated || [];
    const known = [
      CORRECTION_ANALYSIS_FILENAME,
      "correction-runtime-manifest.json",
      "correction-lineage.json",
      CORRECTION_RUNTIME_TELEMETRY_LOG,
      "correction-memory/correction-memory.json",
      ...(semanticPropagationShadow ? [CORRECTION_SEMANTIC_PROPAGATION_ARTIFACT] : []),
    ];
    const seen = new Set((merged.artifacts.generated || []).map((x) => (x.path ? String(x.path) : "")));
    for (const k of known)
      if (k && !seen.has(k)) {
        merged.artifacts.generated.push({ path: k });
        seen.add(k);
      }

    fs.writeFileSync(pArt, JSON.stringify(merged, null, 2), "utf-8");
  } catch (_) {}
}

function deterministicAnalysisId(planId, runId, sig, iterationGuess) {
  return sha256HexOfObject({
    plan_id: planId || "",
    run_id: runId || "",
    failure_signature_sha256: sig || "",
    iteration_projection: iterationGuess != null ? Number(iterationGuess) : null,
    engine: "correction_runtime_v2",
  }).slice(0, 48);
}

function flattenFailureRows(failureBuckets) {
  const rows = [];
  for (const b of failureBuckets || []) {
    for (const it of b.items || []) {
      rows.push({
        classification: b.classification,
        id: it.id,
        subtype: it.subtype,
        confidence: it.confidence,
        evidence: it.evidence,
        probable_causes: it.probable_causes,
        remediation_hints: it.remediation_hints,
      });
    }
  }
  rows.sort((a, b) => `${a.classification}|${a.id}`.localeCompare(`${b.classification}|${b.id}`));
  return rows;
}

function rootCausesFromFailures(flat) {
  const out = [];
  const seen = new Set();
  for (const row of flat || []) {
    const causes = Array.isArray(row.probable_causes) ? row.probable_causes : [];
    for (const c of causes) {
      const s = String(c);
      const k = crypto.createHash("sha256").update(`${row.classification}::${s}`).digest("hex").slice(0, 12);
      if (seen.has(k)) continue;
      seen.add(k);
      out.push({
        hypothesis_id: k,
        text: s,
        linked_classification: row.classification,
      });
      if (out.length >= 40) break;
    }
    if (out.length >= 40) break;
  }
  return out;
}

function correctionsHintsPreferDeterministic(hintsFromResults, hintsStandalone) {
  return {
    ...(hintsStandalone && typeof hintsStandalone === "object" ? hintsStandalone : {}),
    ...(hintsFromResults && typeof hintsFromResults === "object" ? hintsFromResults : {}),
  };
}

function resolvePlanRunIds(snapshot, reviewResults, outputDirResolved) {
  const planId =
    snapshot.plan && snapshot.plan.plan_id != null
      ? String(snapshot.plan.plan_id)
      : reviewResults && reviewResults.plan_id != null
        ? String(reviewResults.plan_id)
        : "";

  const runId =
    reviewResults && reviewResults.run_id != null
      ? String(reviewResults.run_id)
      : snapshot.metadata && snapshot.metadata.runId != null
        ? String(snapshot.metadata.runId)
        : path.basename(outputDirResolved);

  return { planId, runId };
}

function writeCorrectionBundle(opts) {
  const {
    outputDir,
    telemetry,
    classifications,
    failureBuckets,
    signatureBundle,
    snapshot,
    reviewResults,
    mergedHints,
    remediationTargets,
    adaptive,
    memoryBase,
    correctionIterationGuess,
    lineageOutcome,
    suppressedBeforeLlm,
  } = opts;

  const sink = createNdjsonSink(outputDir);

  emitCorrectionTelemetry(sink, telemetry, "failure_classified", {
    classifications: classifications.map((c) => c.classification),
  });

  emitCorrectionTelemetry(sink, telemetry, "remediation_targets_generated", {
    count: remediationTargets.length,
  });

  const flatFailures = flattenFailureRows(failureBuckets);
  const retryScope = suppressedBeforeLlm
    ? { constrained_to_kinds_sorted: [], operation_ids_prioritized_slice: [], guidance: "suppress_no_prompt" }
    : describeRetryScope(remediationTargets);

  const { planId, runId } = resolvePlanRunIds(snapshot, reviewResults, outputDir);

  const correction_analysis_id = deterministicAnalysisId(
    planId,
    runId,
    signatureBundle.failure_signature_sha256,
    correctionIterationGuess,
  );

  const semCorrMode = getSemanticCorrectionPropagationModeFromEnv();
  const propagationManifestDocSemantic =
    semCorrMode === "shadow"
      ? readJson(path.join(outputDir, CORRECTION_SEMANTIC_PROPAGATION_MANIFEST_REF))
      : null;
  const semanticMutationGraphDocSemantic =
    semCorrMode === "shadow"
      ? readJson(path.join(outputDir, CORRECTION_SEMANTIC_MUTATION_GRAPH_REF))
      : null;

  const semanticPropagationBlock = buildSemanticCorrectionPropagationBlock({
    mode: semCorrMode === "shadow" ? "shadow" : "off",
    propagationManifestDoc: propagationManifestDocSemantic,
    semanticGraphDoc: semanticMutationGraphDocSemantic,
    lineageContext: {
      correction_analysis_id,
      plan_id: planId,
      run_id: runId,
    },
  });

  emitCorrectionTelemetry(sink, telemetry, "semantic_correction_propagation_completed", {
    ...(semanticPropagationBlock.telemetry || {}),
  });

  const enrichedAnalysisDraft = {
    correction_analysis_id,
    plan_id: planId,
    run_id: runId,
    generated_at: new Date().toISOString(),
    schema_version: SCHEMA_VERSION_ANALYSIS,
    summary: {
      failure_classification: adaptive.failure_classification,
      retry_recommended: adaptive.retry_recommended,
      retry_probability: adaptive.retry_probability,
      requires_manual_intervention: adaptive.requires_manual_intervention,
      requires_runtime_escalation: adaptive.requires_runtime_escalation,
      suppress_retry: adaptive.suppress_retry,
      retry_band_hint: adaptive.retry_band,
      failure_signature_preview: signatureBundle.failure_signature_sha256
        ? `${String(signatureBundle.failure_signature_sha256).slice(0, 24)}…`
        : null,
      gate_streak:
        suppressedBeforeLlm && memoryBase && memoryBase.identical_trigger_streak != null
          ? Number(memoryBase.identical_trigger_streak)
          : null,
      suppressed_before_llm: !!suppressedBeforeLlm,
    },
    failures: flatFailures,
    root_causes: rootCausesFromFailures(flatFailures),
    correction_targets: suppressedBeforeLlm
      ? []
      : remediationTargets.map((t) => ({
          id: t.target_id,
          kind: t.target_kind,
          priority: t.priority,
          hint: t.hint,
        })),
    recommendations: suppressedBeforeLlm
      ? (adaptive.suppression_policies || []).map((x) => String(x))
      : [
          ...(adaptive.suppression_policies || []).map((x) => `policy:${String(x)}`),
          ...retryScope.constrained_to_kinds_sorted.map((k) => `retry_scope:${k}`),
          ...remediationTargets.slice(0, 10).map((t) => `target:${t.target_id}:${String(t.hint || "").slice(0, 180)}`),
        ].slice(0, 140),
    classifications,
    adaptive_correction: adaptive,
    classification_buckets: failureBuckets,
    fingerprint_canonical_signature: signatureBundle.fingerprint_canonical,
    failure_signature_sha256: signatureBundle.failure_signature_sha256,
    metadata: {
      correction_iterations_estimate: correctionIterationGuess,
      retry_scope_strategy: retryScope.guidance,
      operation_ids_prioritized_slice: retryScope.operation_ids_prioritized_slice || [],
      correction_hints_echo: mergedHints,
    },
    lineage: {},
  };

  emitCorrectionTelemetry(sink, telemetry, "failure_signature_generated", {
    failure_signature_sha256: signatureBundle.failure_signature_sha256,
  });

  let lineageExisting = loadLineage(outputDir);
  if (!lineageExisting || typeof lineageExisting !== "object") {
    lineageExisting = emptyLineage({ run_id: runId, plan_id: planId });
  }

  const parent =
    lineageExisting.chain && lineageExisting.chain.length
      ? lineageExisting.chain[lineageExisting.chain.length - 1].correction_lineage_node_id
      : null;

  const appended = appendLineageNode({
    lineage: lineageExisting,
    parent_id: parent,
    iteration:
      correctionIterationGuess != null
        ? Number(correctionIterationGuess) + 1
        : (lineageExisting.chain || []).length + 1,
    signature_sha256: signatureBundle.failure_signature_sha256,
    classification_primary: adaptive.failure_classification,
    outcome:
      suppressedBeforeLlm ? "retry_suppressed_gate" : lineageOutcome || "analysis_emitted_llm_follows",
    suppression: suppressedBeforeLlm ? adaptive.suppression_reason : null,
    escalation: adaptive.escalation_event || null,
    remediation_targets_count: remediationTargets.length,
    correction_analysis_id,
  });

  let lineageToPersist = appended.lineage;
  if (
    semCorrMode === "shadow" &&
    semanticPropagationBlock.semantic_lineage_refs &&
    typeof semanticPropagationBlock.semantic_lineage_refs === "object"
  ) {
    lineageToPersist = {
      ...appended.lineage,
      extensions: {
        ...(appended.lineage.extensions && typeof appended.lineage.extensions === "object"
          ? appended.lineage.extensions
          : {}),
        semantic_lineage_refs: semanticPropagationBlock.semantic_lineage_refs,
      },
    };
  }
  persistLineage(outputDir, lineageToPersist);

  const bumped = bumpSignatureStats(
    memoryBase || loadCorrectionMemory(outputDir),
    signatureBundle.failure_signature_sha256 || "",
  );
  const memoryNext = bumped.merged;

  memoryNext.retries = Array.isArray(memoryNext.retries) ? memoryNext.retries : [];
  memoryNext.retries.push({
    correction_analysis_id,
    at: new Date().toISOString(),
    signature_sha256: signatureBundle.failure_signature_sha256,
    tag: suppressedBeforeLlm ? "suppressed_gate" : "analysis_emitted",
  });
  memoryNext.retries = memoryNext.retries.slice(-2000);
  persistCorrectionMemory(outputDir, memoryNext);

  const manifest = buildCorrectionRuntimeManifest({
    correction_analysis_id,
    plan_id: planId,
    run_id: runId,
    failure_signature_sha256: signatureBundle.failure_signature_sha256,
    telemetry_event_count_estimate: 6 + remediationTargets.length,
  });
  manifest.suppression =
    adaptive.suppress_retry && adaptive.suppression_reason ? [adaptive.suppression_reason] : [];
  manifest.refs = manifest.refs || {};
  manifest.refs.remediation_manifest = CORRECTION_ANALYSIS_FILENAME;
  manifest.refs.correction_analysis_id = correction_analysis_id;

  try {
    if (fs.existsSync(path.join(outputDir, "transaction-runtime.json"))) {
      manifest.extensions = manifest.extensions || {};
      manifest.extensions.transaction_runtime = { contract_ref: "transaction-runtime.json" };
    }
  } catch (_) {
    /* best-effort */
  }

  manifest.semantic_propagation = semanticPropagationBlock;

  writeManifestToDisk(fs, path, outputDir, manifest);

  const enrichedAnalysis = {
    ...enrichedAnalysisDraft,
    lineage: {
      last_node_id: appended.node.correction_lineage_node_id,
    },
    classification_buckets_summarized: (failureBuckets || []).map((b) => ({
      classification: b.classification,
      count: (b.items || []).length,
    })),
    retry_scope: retryScope,
    semantic_propagation: semanticPropagationBlock,
  };

  const outPath = path.join(outputDir, CORRECTION_ANALYSIS_FILENAME);
  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  fs.writeFileSync(outPath, JSON.stringify(enrichedAnalysis, null, 2), "utf-8");

  if (semCorrMode === "shadow") {
    const semArtPath = path.join(outputDir, CORRECTION_SEMANTIC_PROPAGATION_ARTIFACT);
    fs.mkdirSync(path.dirname(semArtPath), { recursive: true });
    fs.writeFileSync(semArtPath, JSON.stringify(semanticPropagationBlock, null, 2), "utf-8");
  }

  emitCorrectionTelemetry(sink, telemetry, "correction_completed", {
    analysis_id: correction_analysis_id,
    suppressed_before_llm: !!suppressedBeforeLlm,
  });

  if (adaptive.requires_runtime_escalation) {
    emitCorrectionTelemetry(sink, telemetry, "correction_escalated", adaptive.escalation_event || {});
  }

  mergePlanArtifactsCorrectionRuntime(outputDir, {
    semanticPropagationShadow: semCorrMode === "shadow",
  });

  return enrichedAnalysis;
}

function correctionIterationGuessFromDisk(outputDir) {
  const runLogFlat = readJson(path.join(outputDir, "run-log.json"));
  if (runLogFlat && typeof runLogFlat.correction_iterations === "number")
    return runLogFlat.correction_iterations;

  const m = readJson(path.join(outputDir, "metadata.json"));
  if (!m || typeof m !== "object") return null;
  if (typeof m.correction_iterations === "number") return m.correction_iterations;
  const nested =
    typeof m.execution === "object" &&
    m.execution &&
    typeof m.execution.correction_iterations === "number"
      ? m.execution.correction_iterations
      : null;
  if (nested != null) return nested;
  return typeof m.previous_correction_iterations === "number" ? m.previous_correction_iterations : null;
}

function evaluateCorrectionRetrySuppressionGate({ outputDir, telemetry }) {
  try {
    if (!isAdaptiveCorrectionOrchestrationEnabled())
      return { allow_correction: true, suppressed: false };

    const out = path.resolve(outputDir);
    const sink = createNdjsonSink(out);
    const snapshot = collectRuntimeSnapshot(out);
    const reviewResults = readJson(path.join(out, REVIEW_RESULTS_FILENAME));
    const correctionHintsStandalone = readJson(path.join(out, REVIEW_CORRECTION_HINTS_FILENAME)) || {};

    const mergedHints = correctionsHintsPreferDeterministic(
      (reviewResults && reviewResults.correction_hints) || {},
      correctionHintsStandalone,
    );

    const classified = classifyFailures({
      snapshot,
      reviewResults,
      correctionHints: mergedHints,
    });
    const failureBuckets = classified.failures || [];
    let classificationsList = classified.classifications || [];
    if (!classificationsList.length && failureBuckets.length) {
      const mapCounts = {};
      for (const b of failureBuckets) mapCounts[b.classification] = (b.items || []).length;
      classificationsList = Object.keys(mapCounts).map((classification) => ({
        classification,
        observed_items: mapCounts[classification],
      }));
    }

    const signatureBundle = computeFailureSignature({
      classifications: classificationsList,
      failures: failureBuckets,
      snapshot,
      reviewResults,
      correctionHints: mergedHints,
    });
    const incomingSig = signatureBundle.failure_signature_sha256 || "";

    const policies = getCorrectionPolicies();
    const memoryLoaded = loadCorrectionMemory(out);

    emitCorrectionTelemetry(sink, telemetry, "correction_started", {
      adaptive_gate_only: true,
    });

    const gateStreak = computeNextStreakForGate(memoryLoaded, incomingSig);
    const gatedMemory = persistCorrectionMemory(out, finalizeMemoryAfterGate(memoryLoaded, incomingSig, gateStreak));

    const adaptive = computeAdaptiveDecision({
      memoryStreakSignature: gateStreak,
      policies,
      snapshot,
      reviewResults,
      classifications: classificationsList,
      failureSignatureSha256: incomingSig,
      remediationTargets: [],
    });

    emitCorrectionTelemetry(sink, telemetry, "failure_signature_generated", {
      failure_signature_sha256: incomingSig,
      streak: gateStreak,
    });

    if (
      incomingSig &&
      gateStreak >= policies.retry_suppression_identical_signature_streak
    ) {
      emitCorrectionTelemetry(sink, telemetry, "retry_suppressed", {
        gate_streak: gateStreak,
        threshold: policies.retry_suppression_identical_signature_streak,
      });

      writeCorrectionBundle({
        outputDir: out,
        telemetry,
        classifications: classificationsList,
        failureBuckets,
        signatureBundle,
        snapshot,
        reviewResults,
        mergedHints,
        remediationTargets: [],
        adaptive: { ...adaptive, suppress_retry: true, retry_probability: 0, retry_recommended: false },
        memoryBase: gatedMemory,
        correctionIterationGuess: correctionIterationGuessFromDisk(out),
        lineageOutcome: "retry_suppressed_gate",
        suppressedBeforeLlm: true,
      });

      return {
        allow_correction: false,
        suppressed: true,
        gate_streak: gateStreak,
        failure_signature_sha256: incomingSig,
      };
    }

    return {
      allow_correction: true,
      suppressed: false,
      gate_streak: gateStreak,
      failure_signature_sha256: incomingSig,
    };
  } catch (_) {
    return { allow_correction: true, suppressed: false, gate_fallback_exception: true };
  }
}

function persistFullCorrectionArtifacts({ outputDir, telemetry, hintsOverride }) {
  if (!isCorrectionIntelligenceEnabled()) return { skipped: true, reason: "correction_engine_off" };

  try {
    const out = path.resolve(outputDir);
    const sink = createNdjsonSink(out);
    emitCorrectionTelemetry(sink, telemetry, "correction_started", {
      guided_pipeline: true,
    });

    const snapshot = collectRuntimeSnapshot(out);
    const reviewResults = readJson(path.join(out, REVIEW_RESULTS_FILENAME));
    const standaloneHints = readJson(path.join(out, REVIEW_CORRECTION_HINTS_FILENAME)) || {};

    const mergedHints = correctionsHintsPreferDeterministic(
      (reviewResults && reviewResults.correction_hints) || {},
      hintsOverride && typeof hintsOverride === "object" ? hintsOverride : standaloneHints,
    );

    const classified = classifyFailures({
      snapshot,
      reviewResults,
      correctionHints: mergedHints,
    });
    const failureBuckets = classified.failures || [];
    const classificationsList =
      classified.classifications && classified.classifications.length
        ? classified.classifications
        : (() => {
            const mapCounts = {};
            for (const b of failureBuckets) mapCounts[b.classification] = (b.items || []).length;
            return Object.keys(mapCounts).map((classification) => ({
              classification,
              observed_items: mapCounts[classification],
            }));
          })();

    const signatureBundle = computeFailureSignature({
      classifications: classificationsList,
      failures: failureBuckets,
      snapshot,
      reviewResults,
      correctionHints: mergedHints,
    });

    const remediationTargets = prioritizedRemediationTargets({
      failures: failureBuckets,
      correctionHints: mergedHints,
      snapshot,
      outputDir: out,
    });

    const memoryNow = loadCorrectionMemory(out);
    const iterationGuess = correctionIterationGuessFromDisk(out);

    const adaptive = computeAdaptiveDecision({
      memoryStreakSignature: computeNextStreakForGate(memoryNow, signatureBundle.failure_signature_sha256),
      policies: getCorrectionPolicies(),
      snapshot,
      reviewResults,
      classifications: classificationsList,
      failureSignatureSha256: signatureBundle.failure_signature_sha256 || "",
      remediationTargets,
    });

    emitCorrectionTelemetry(sink, telemetry, "failure_signature_generated", {
      failure_signature_sha256: signatureBundle.failure_signature_sha256,
    });

    writeCorrectionBundle({
      outputDir: out,
      telemetry,
      classifications: classificationsList,
      failureBuckets,
      signatureBundle,
      snapshot,
      reviewResults,
      mergedHints,
      remediationTargets,
      adaptive,
      memoryBase: memoryNow,
      correctionIterationGuess: iterationGuess,
      lineageOutcome: "generated_instructions",
      suppressedBeforeLlm: false,
    });

    emitCorrectionTelemetry(sink, telemetry, "guided_correction_bundle_written", {
      note: "llm_correction_follows_if_eligible",
    });

    return { ok: true, artifact: CORRECTION_ANALYSIS_FILENAME };
  } catch (_) {
    return { ok: false, reason: "correction_pipeline_fallback" };
  }
}

module.exports = {
  evaluateCorrectionRetrySuppressionGate,
  persistFullCorrectionArtifacts,
};
