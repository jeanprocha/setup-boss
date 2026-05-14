/**
 * Validation Targeting — API shadow (Fase 4.1.2).
 * Integração com Execution Plan; falhas são sempre engolidas pelo chamador opcionalmente.
 */

const fs = require("fs");
const path = require("path");
const {
  isShadowPlanModeEnabled,
  getSemanticValidationPropagationModeFromEnv,
} = require("../feature-flags");
const { loadPlan } = require("../persistence/plan-store");
const { loadExecutionReconciliation } = require("../reconciliation/reconciliation-engine");
const { emitPlanTelemetryEvent } = require("../telemetry/plan-telemetry");
const { savePlanArtifactsManifest } = require("../manifest/plan-artifacts-manifest");
const { generateValidationTargets } = require("./validation-target-generator");
const {
  VALIDATION_PROPAGATION_MANIFEST_FILENAME,
  VALIDATION_PLAN_FILENAME,
  VALIDATION_RESULTS_FILENAME,
  VALIDATION_CACHE_FILENAME,
  VALIDATION_RUNTIME_SUMMARY_FILENAME,
} = require("./constants");
const {
  buildDependencyGraphDoc,
  enrichValidationTargetsWithGraphImpact,
  saveDependencyGraph,
} = require("./dependency-graph");
const {
  saveValidationTargets,
  saveValidationManifest,
  buildValidationManifest,
  loadValidationManifest,
} = require("./validation-manifest");
const { emitValidationTargetingEvent } = require("./validation-telemetry");
const {
  loadPropagationManifest,
  loadSemanticMutationGraph,
} = require("../../semantic-dependency-runtime/overlay/semantic-mutation-overlay");
const {
  buildValidationPropagationManifest,
  saveValidationPropagationManifest,
} = require("./semantic-validation-propagation");
const { buildValidationPlanDocument, saveValidationPlan } = require("./validation-plan-builder");

function readExecutorChangesDisk(outputDir) {
  const p = path.join(String(outputDir || ""), "executor-changes.json");
  try {
    if (!fs.existsSync(p)) return [];
    const raw = JSON.parse(fs.readFileSync(p, "utf8"));
    return Array.isArray(raw) ? raw : [];
  } catch (_) {
    return [];
  }
}

function resolveProjectRootFromOutputDir(outputDir) {
  const metaPath = path.join(String(outputDir || ""), "metadata.json");
  try {
    if (!fs.existsSync(metaPath)) return null;
    const meta = JSON.parse(fs.readFileSync(metaPath, "utf8"));
    return meta.projectRoot != null ? String(meta.projectRoot) : null;
  } catch (_) {
    return null;
  }
}

function histogramScopes(targets) {
  const h = { file: 0, module: 0, project: 0 };
  for (const t of targets) {
    const s = t && t.validation_scope;
    if (s === "file") h.file += 1;
    else if (s === "module") h.module += 1;
    else if (s === "project") h.project += 1;
  }
  return h;
}

function totalDependencyHints(targets) {
  let n = 0;
  for (const t of targets) {
    if (Array.isArray(t.dependency_hints)) n += t.dependency_hints.length;
  }
  return n;
}

/**
 * @param {{ ctx?: object|null, outputDir: string, runId: string, phase: 'post_architect'|'post_reconciliation' }} args
 */
function runShadowValidationTargeting(args) {
  const telemetryRegistry = [];

  try {
    if (!isShadowPlanModeEnabled()) {
      return { ok: true, skipped: true, reason: "plan_mode_off" };
    }

    const outputDir = args && args.outputDir;
    const runId = args && args.runId;
    const phase =
      args && args.phase === "post_architect" ? "post_architect" : "post_reconciliation";

    if (!outputDir || !runId) {
      return { ok: true, skipped: true, reason: "missing_context" };
    }

    const plan = loadPlan(outputDir);
    if (!plan || typeof plan !== "object") {
      return { ok: true, skipped: true, reason: "no_plan" };
    }

    const recon =
      phase === "post_architect"
        ? null
        : loadExecutionReconciliation(outputDir);

    const executorChanges =
      phase === "post_architect" ? [] : readExecutorChangesDisk(outputDir);

    const projectRoot = resolveProjectRootFromOutputDir(outputDir);

    const targetsDoc = generateValidationTargets({
      plan,
      reconciliation: recon,
      executorChanges,
      projectRoot,
      runId: String(runId),
    });

    let dependencyGraphDoc = null;
    try {
      dependencyGraphDoc = buildDependencyGraphDoc({
        projectRoot,
        targetsDoc,
        plan,
      });
      enrichValidationTargetsWithGraphImpact(targetsDoc, dependencyGraphDoc);
      saveDependencyGraph(outputDir, dependencyGraphDoc);
    } catch (_) {
      dependencyGraphDoc = null;
    }

    saveValidationTargets(outputDir, targetsDoc);

    const scopeHist = histogramScopes(targetsDoc.targets || []);

    emitValidationTargetingEvent(args.ctx && args.ctx.telemetry, "validation_targets_generated", {
      run_id: String(runId),
      phase,
      total_targets: targetsDoc.summary && targetsDoc.summary.total_targets,
      unique_files: targetsDoc.summary && targetsDoc.summary.unique_files,
    });
    telemetryRegistry.push({
      name: "validation_targets_generated",
      at: new Date().toISOString(),
      data: { phase, total_targets: targetsDoc.summary && targetsDoc.summary.total_targets },
    });

    emitValidationTargetingEvent(args.ctx && args.ctx.telemetry, "validation_scope_inferred", {
      run_id: String(runId),
      phase,
      scopes: scopeHist,
    });
    telemetryRegistry.push({
      name: "validation_scope_inferred",
      at: new Date().toISOString(),
      data: { scopes: scopeHist },
    });

    const vt =
      targetsDoc.summary &&
      Array.isArray(targetsDoc.summary.validator_types)
        ? targetsDoc.summary.validator_types.length
        : 0;

    emitValidationTargetingEvent(args.ctx && args.ctx.telemetry, "validator_inference_completed", {
      run_id: String(runId),
      phase,
      validator_types_count: vt,
      validator_types: targetsDoc.summary && targetsDoc.summary.validator_types,
    });
    telemetryRegistry.push({
      name: "validator_inference_completed",
      at: new Date().toISOString(),
      data: { validator_types_count: vt },
    });

    const dh = totalDependencyHints(targetsDoc.targets || []);

    emitValidationTargetingEvent(args.ctx && args.ctx.telemetry, "dependency_hints_generated", {
      run_id: String(runId),
      phase,
      hints_total: dh,
    });
    telemetryRegistry.push({
      name: "dependency_hints_generated",
      at: new Date().toISOString(),
      data: { hints_total: dh },
    });

    if (dependencyGraphDoc && dependencyGraphDoc.metadata && dependencyGraphDoc.metadata.stats) {
      emitValidationTargetingEvent(args.ctx && args.ctx.telemetry, "dependency_graph_built", {
        run_id: String(runId),
        phase,
        nodes_total: dependencyGraphDoc.metadata.stats.nodes_total,
        edges_total: dependencyGraphDoc.metadata.stats.edges_total,
        unresolved_import_skips: dependencyGraphDoc.metadata.stats.unresolved_imports_skipped,
        graph_fingerprint_sha256: dependencyGraphDoc.fingerprints.graph_content_sha256,
      });
      telemetryRegistry.push({
        name: "dependency_graph_built",
        at: new Date().toISOString(),
        data: {
          nodes_total: dependencyGraphDoc.metadata.stats.nodes_total,
          edges_total: dependencyGraphDoc.metadata.stats.edges_total,
        },
      });
    }

    const propagationModeTargeting = getSemanticValidationPropagationModeFromEnv();
    const propagationManifestDoc =
      propagationModeTargeting === "shadow" ? loadPropagationManifest(outputDir) : null;
    const semanticMutationGraphDoc =
      propagationModeTargeting === "shadow" ? loadSemanticMutationGraph(outputDir) : null;

    const semanticPropagationBundle = buildValidationPropagationManifest({
      mode: propagationModeTargeting === "shadow" ? "shadow" : "off",
      targetsDoc,
      propagationManifestDoc,
      semanticMutationGraphDoc,
      projectRoot,
      createdAt: targetsDoc.generated_at,
    });
    saveValidationPropagationManifest(outputDir, semanticPropagationBundle.manifest);

    emitValidationTargetingEvent(
      args.ctx && args.ctx.telemetry,
      "semantic_validation_propagation_completed",
      {
        run_id: String(runId),
        phase,
        semantic_propagation_enabled: semanticPropagationBundle.telemetry_snapshot.semantic_propagation_enabled,
        semantic_candidates_generated: semanticPropagationBundle.telemetry_snapshot.semantic_candidates_generated,
        semantic_expansion_skipped: semanticPropagationBundle.telemetry_snapshot.semantic_expansion_skipped,
        semantic_propagation_shadow: semanticPropagationBundle.telemetry_snapshot.semantic_propagation_shadow,
        semantic_expansion_reason: semanticPropagationBundle.telemetry_snapshot.semantic_expansion_reason,
        propagation_id: semanticPropagationBundle.telemetry_snapshot.propagation_id,
      },
    );
    telemetryRegistry.push({
      name: "semantic_validation_propagation_completed",
      at: new Date().toISOString(),
      data: semanticPropagationBundle.telemetry_snapshot,
    });

    emitPlanTelemetryEvent(args.ctx && args.ctx.telemetry, "validation_manifest_updated", {
      run_id: String(runId),
      phase,
    });
    emitValidationTargetingEvent(args.ctx && args.ctx.telemetry, "validation_manifest_updated", {
      run_id: String(runId),
      phase,
    });
    telemetryRegistry.push({
      name: "validation_manifest_updated",
      at: new Date().toISOString(),
      data: { phase },
    });

    const manifest = buildValidationManifest({
      plan,
      targetsDoc,
      phase,
      reconciliation: recon,
      executorChangesCount: executorChanges.length,
      telemetryEvents: telemetryRegistry,
      generatedAt: targetsDoc.generated_at,
      extra_refs: {
        validation_propagation_manifest_ref: VALIDATION_PROPAGATION_MANIFEST_FILENAME,
      },
      extensions_extra: {
        semantic_validation_propagation: {
          propagation_mode: semanticPropagationBundle.manifest.propagation_mode,
          propagation_id: semanticPropagationBundle.manifest.propagation_id,
          propagation_fingerprint_sha256:
            semanticPropagationBundle.manifest.propagation_fingerprint_sha256,
        },
        ...(dependencyGraphDoc &&
        dependencyGraphDoc.fingerprints &&
        dependencyGraphDoc.metadata &&
        dependencyGraphDoc.metadata.stats
          ? {
              dependency_graph: {
                graph_fingerprint_sha256: dependencyGraphDoc.fingerprints.graph_content_sha256,
                nodes_total: dependencyGraphDoc.metadata.stats.nodes_total,
                edges_total: dependencyGraphDoc.metadata.stats.edges_total,
                unresolved_imports_skipped:
                  dependencyGraphDoc.metadata.stats.unresolved_imports_skipped,
              },
            }
          : {}),
      },
    });

    saveValidationManifest(outputDir, manifest);

    try {
      const validationPlan = buildValidationPlanDocument({
        outputDir,
        phase,
        targetsDoc,
        validationManifestDoc: manifest,
        propagationManifestDoc: semanticPropagationBundle.manifest,
        executorChanges,
      });
      if (validationPlan) {
        saveValidationPlan(outputDir, validationPlan);
        let validationExecDoc = null;
        try {
          const { runValidationExecutorSync, saveValidationResults } = require("./validation-executor");
          const { doc } = runValidationExecutorSync({ outputDir, planDoc: validationPlan });
          saveValidationResults(outputDir, doc);
          validationExecDoc = doc;
        } catch (_) {
          /* executor opcional — falha de validator não aborta o targeting */
        }

        if (validationExecDoc && validationExecDoc.summary) {
          try {
            const vm = loadValidationManifest(outputDir);
            if (vm) {
              vm.telemetry_events = Array.isArray(vm.telemetry_events) ? vm.telemetry_events : [];
              vm.telemetry_events.push({
                name: "validation_execution_completed",
                at: new Date().toISOString(),
                data: {
                  total: validationExecDoc.summary.total,
                  passed: validationExecDoc.summary.passed,
                  failed: validationExecDoc.summary.failed,
                  skipped: validationExecDoc.summary.skipped,
                  unresolved: validationExecDoc.summary.unresolved,
                  total_duration_ms: validationExecDoc.summary.total_duration_ms,
                  cache_hits: validationExecDoc.summary.cache_hits,
                  cache_misses: validationExecDoc.summary.cache_misses,
                  cache_reused: validationExecDoc.summary.cache_reused,
                  validation_results_identity_sha256:
                    validationExecDoc.fingerprints &&
                    validationExecDoc.fingerprints.validation_results_identity_sha256,
                },
              });
              vm.refs = vm.refs && typeof vm.refs === "object" ? vm.refs : {};
              vm.refs.validation_plan_ref = VALIDATION_PLAN_FILENAME;
              vm.refs.validation_results_ref = VALIDATION_RESULTS_FILENAME;
              vm.refs.validation_cache_ref = VALIDATION_CACHE_FILENAME;
              vm.refs.validation_runtime_summary_ref = VALIDATION_RUNTIME_SUMMARY_FILENAME;
              saveValidationManifest(outputDir, vm);
            }
            emitValidationTargetingEvent(
              args.ctx && args.ctx.telemetry,
              "validation_execution_completed",
              {
                run_id: String(runId),
                phase,
                passed: validationExecDoc.summary.passed,
                failed: validationExecDoc.summary.failed,
                unresolved: validationExecDoc.summary.unresolved,
                cache_hits: validationExecDoc.summary.cache_hits,
                cache_misses: validationExecDoc.summary.cache_misses,
                cache_reused: validationExecDoc.summary.cache_reused,
                total_duration_ms: validationExecDoc.summary.total_duration_ms,
              },
            );
            emitPlanTelemetryEvent(args.ctx && args.ctx.telemetry, "validation_execution_completed", {
              run_id: String(runId),
              plan_id: plan.plan_id,
              passed: validationExecDoc.summary.passed,
              failed: validationExecDoc.summary.failed,
              unresolved: validationExecDoc.summary.unresolved,
              cache_hits: validationExecDoc.summary.cache_hits,
              cache_misses: validationExecDoc.summary.cache_misses,
              total_duration_ms: validationExecDoc.summary.total_duration_ms,
            });
          } catch (_) {
            /* opcional */
          }
        }
      }
    } catch (_) {
      /* opcional */
    }

    try {
      savePlanArtifactsManifest(outputDir, {
        plan,
        run_id: runId,
        plan_id: plan.plan_id,
      });
    } catch (_) {
      /* opcional */
    }

    return {
      ok: true,
      phase,
      summary: targetsDoc.summary || null,
    };
  } catch (err) {
    try {
      emitValidationTargetingEvent(args.ctx && args.ctx.telemetry, "validation_targets_generated", {
        run_id: args && args.runId,
        outcome: "fatal_swallowed",
        message: String((err && err.message) || err || "").slice(0, 400),
      });
    } catch (_) {
      /* ignore */
    }
    return {
      ok: false,
      skipped: false,
      message: String((err && err.message) || err || ""),
    };
  }
}

function runShadowValidationTargetingAfterArchitect(args) {
  return runShadowValidationTargeting({
    ...(args || {}),
    phase: "post_architect",
  });
}

function runShadowValidationTargetingAfterReconciliation(args) {
  return runShadowValidationTargeting({
    ...(args || {}),
    phase: "post_reconciliation",
  });
}

module.exports = {
  runShadowValidationTargeting,
  runShadowValidationTargetingAfterArchitect,
  runShadowValidationTargetingAfterReconciliation,
};
