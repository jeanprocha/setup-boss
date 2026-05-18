"use strict";

const fs = require("fs");
const path = require("path");

const { resolveOutputDir } = require("../../../core/run-resolver");
const { isSafeRelativePath } = require("./run-evidence");
const {
  loadOrBuildOperationalExecutableStrategy,
} = require("../../../core/load-operational-executable-strategy");
const {
  mapOperationalExecutableStrategyDto,
  enrichSubtasksFromOesDto,
  enrichOrderingFromOesDto,
} = require("../../../core/map-operational-executable-strategy-dto");

const STRATEGY_DIR = "strategy";
const SUBTASKS_DIR = "subtasks";

const FILES = {
  complexity: "complexity-analysis.json",
  ai: "ai-strategy.json",
  decomposition: "decomposition.json",
  order: "execution-order.json",
  shared: "shared-runtime-context.json",
  readiness: "strategy-readiness.json",
};

/**
 * @param {string} fp
 * @returns {Record<string, unknown>|null}
 */
function safeReadJson(fp) {
  try {
    if (!fs.existsSync(fp)) return null;
    const j = JSON.parse(fs.readFileSync(fp, "utf-8"));
    return j && typeof j === "object" && !Array.isArray(j) ? j : null;
  } catch {
    return null;
  }
}

/**
 * @param {string} outputDir
 * @param {string} rel
 */
function safeReadArtifact(outputDir, rel) {
  const norm = String(rel || "").replace(/\\/g, "/").trim();
  if (!isSafeRelativePath(norm)) return null;
  return safeReadJson(path.join(outputDir, norm.replace(/\//g, path.sep)));
}

/**
 * @param {string} classification
 */
function mapComplexityLevel(classification) {
  const c = String(classification || "").toLowerCase();
  if (c === "trivial" || c === "simple") return "low";
  if (c === "moderate") return "medium";
  if (c === "complex") return "high";
  if (c === "critical") return "expert";
  return "medium";
}

/**
 * @param {Record<string, unknown>|null} complexityDoc
 */
function mapComplexityDto(complexityDoc) {
  if (!complexityDoc) {
    return {
      level: "medium",
      estimatedDifficulty: "unknown",
      executionRisk: "medium",
      runtimeLoad: "moderate",
      coordinationComplexity: "medium",
      rationale: null,
    };
  }
  const scores =
    complexityDoc.scores && typeof complexityDoc.scores === "object"
      ? complexityDoc.scores
      : {};
  const overall = Number(/** @type {Record<string, unknown>} */ (scores).overall);
  const risk = Number(/** @type {Record<string, unknown>} */ (scores).risk);
  const level = mapComplexityLevel(complexityDoc.classification);
  const executionRisk =
    risk <= 3 ? "low" : risk >= 7 ? "high" : overall <= 3 ? "low" : overall >= 7 ? "high" : "medium";
  return {
    level,
    estimatedDifficulty: String(complexityDoc.classification || level),
    executionRisk,
    runtimeLoad:
      level === "low" ? "light" : level === "expert" || level === "high" ? "heavy" : "moderate",
    coordinationComplexity:
      level === "expert" ? "high" : level === "low" ? "low" : "medium",
    rationale: Array.isArray(complexityDoc.recommendations)
      ? complexityDoc.recommendations.slice(0, 3).map((x) => String(x)).join("; ")
      : null,
  };
}

/**
 * @param {Record<string, unknown>|null} aiDoc
 */
function mapRecommendationDto(aiDoc) {
  const modeRaw = aiDoc ? String(aiDoc.recommended_mode || "") : "";
  const mode =
    modeRaw === "basic" || modeRaw === "standard" || modeRaw === "expert"
      ? modeRaw
      : "standard";
  const rationale = aiDoc && Array.isArray(aiDoc.rationale)
    ? aiDoc.rationale.map((x) => String(x)).join(" ")
    : "";
  return {
    recommendedMode: mode,
    modelStrategy: aiDoc && aiDoc.model_strategy != null
      ? String(aiDoc.model_strategy)
      : `${mode} pipeline`,
    executionApproach:
      aiDoc && aiDoc.execution_approach != null
        ? String(aiDoc.execution_approach)
        : "Decomposição linear com gates de review",
    rationale: rationale || "Modo derivado da análise de complexidade.",
    operationalImpact:
      aiDoc && aiDoc.operational_impact != null
        ? String(aiDoc.operational_impact)
        : "Define paralelismo, profundidade de review e custo de tokens.",
    costPerformanceHint:
      aiDoc && aiDoc.cost_profile != null
        ? `cost=${String(aiDoc.cost_profile)}`
        : null,
  };
}

/**
 * @param {string} strategyDir
 */
function listSubtaskFiles(strategyDir) {
  const subDir = path.join(strategyDir, SUBTASKS_DIR);
  if (!fs.existsSync(subDir)) return [];
  /** @type {string[]} */
  const out = [];
  try {
    for (const name of fs.readdirSync(subDir)) {
      if (!/^\d{3}\.json$/i.test(name)) continue;
      out.push(`${STRATEGY_DIR}/${SUBTASKS_DIR}/${name}`.replace(/\\/g, "/"));
    }
  } catch {
    return [];
  }
  return out.sort();
}

/**
 * @param {string} outputDir
 * @param {string[]} relPaths
 */
function mapSubtasks(outputDir, relPaths) {
  return relPaths.map((rel, idx) => {
    const doc = safeReadArtifact(outputDir, rel) || {};
    const id = path.basename(rel, ".json");
    const deps = Array.isArray(doc.dependencies)
      ? doc.dependencies.map((d) => String(d)).filter((d) => /^\d{3}$/.test(d))
      : [];
    const stateRaw = String(doc.status || doc.state || "planned").toLowerCase();
    const state =
      stateRaw === "ready" ||
      stateRaw === "planned" ||
      stateRaw === "blocked" ||
      stateRaw === "pending" ||
      stateRaw === "skipped"
        ? stateRaw
        : "planned";
    const readiness = deps.length > 0 && state === "planned" ? "not_ready" : state === "blocked" ? "blocked" : state === "ready" ? "ready" : "not_ready";
    return {
      id,
      title: String(doc.title || id),
      parentId: doc.parent_id != null ? String(doc.parent_id) : null,
      order: typeof doc.position === "number" ? doc.position : idx + 1,
      state,
      dependsOn: deps,
      ownership: doc.ownership != null ? String(doc.ownership) : null,
      readiness,
      blockerLabel: doc.blocker_label != null ? String(doc.blocker_label) : null,
    };
  });
}

/**
 * @param {Record<string, unknown>|null} orderDoc
 * @param {{ id: string, title: string, readiness: string, dependsOn: string[] }[]} subtasks
 */
function mapOrdering(orderDoc, subtasks) {
  const ordered = orderDoc && Array.isArray(orderDoc.ordered_subtasks)
    ? orderDoc.ordered_subtasks
    : [];
  const modeRaw = orderDoc ? String(orderDoc.ordering_mode || "") : "";
  const orderingMode =
    modeRaw === "parallel" || modeRaw === "staged" || modeRaw === "linear"
      ? modeRaw
      : "linear";
  const blocking = orderDoc && Array.isArray(orderDoc.blocking_subtasks)
    ? orderDoc.blocking_subtasks
    : [];
  const blockedIds = new Set(
    blocking
      .map((row) => {
        if (!row || typeof row !== "object") return "";
        return String(/** @type {Record<string, unknown>} */ (row).subtask_id || "");
      })
      .filter((x) => /^\d{3}$/.test(x)),
  );

  const sequence = ordered.length
    ? ordered.map((row, idx) => {
        if (!row || typeof row !== "object") return null;
        const r = /** @type {Record<string, unknown>} */ (row);
        const subtaskId = String(r.subtask_id || "").trim();
        const st = subtasks.find((s) => s.id === subtaskId);
        const dep = Array.isArray(r.depends_on)
          ? r.depends_on.map((d) => String(d)).filter((d) => /^\d{3}$/.test(d))
          : [];
        const status = blockedIds.has(subtaskId)
          ? "blocked"
          : st?.readiness === "ready"
            ? "ready"
            : dep.length > 0
              ? "pending"
              : "pending";
        return {
          position: typeof r.position === "number" ? r.position : idx + 1,
          subtaskId,
          title: String(r.title || st?.title || subtaskId),
          dependsOn: dep,
          status,
        };
      }).filter(Boolean)
    : subtasks.map((s, idx) => ({
        position: idx + 1,
        subtaskId: s.id,
        title: s.title,
        dependsOn: s.dependsOn,
        status: s.readiness === "ready" ? "ready" : s.readiness === "blocked" ? "blocked" : "pending",
      }));

  const blockingDependencies = [];
  for (const row of sequence) {
    if (!row) continue;
    for (const dep of row.dependsOn) {
      blockingDependencies.push({
        from: dep,
        to: row.subtaskId,
        label: `${dep} → ${row.subtaskId}`,
      });
    }
  }

  return {
    orderingMode,
    sequence,
    readyIds: sequence.filter((s) => s && s.status === "ready").map((s) => s.subtaskId),
    pendingIds: sequence.filter((s) => s && s.status === "pending").map((s) => s.subtaskId),
    blockingDependencies,
  };
}

/**
 * @param {Record<string, unknown>|null} sharedDoc
 */
function mapSharedContext(sharedDoc) {
  if (!sharedDoc) {
    return { artifacts: [], constraints: [], rules: [], crossSubtaskDeps: [] };
  }
  return {
    artifacts: Array.isArray(sharedDoc.context_refs)
      ? sharedDoc.context_refs.map((x) => String(x))
      : [],
    constraints: Array.isArray(sharedDoc.constraints)
      ? sharedDoc.constraints.map((x) => String(x))
      : [],
    rules: Array.isArray(sharedDoc.rules)
      ? sharedDoc.rules.map((x) => String(x))
      : [],
    crossSubtaskDeps: [],
  };
}

/**
 * @param {Record<string, unknown>|null} complexityDoc
 * @param {Record<string, unknown>|null} orderDoc
 * @param {Record<string, unknown>|null} readinessDoc
 */
function mapRisks(complexityDoc, orderDoc, readinessDoc) {
  /** @type {{ id: string, label: string, level: "low"|"medium"|"high" }[]} */
  const risks = [];
  let i = 0;
  const push = (label, level = "medium") => {
    i += 1;
    risks.push({ id: `risk-${i}`, label: String(label).slice(0, 240), level });
  };
  if (complexityDoc && Array.isArray(complexityDoc.signals)) {
    for (const s of complexityDoc.signals.slice(0, 5)) {
      push(String(s), "medium");
    }
  }
  if (orderDoc && Array.isArray(orderDoc.dependency_warnings)) {
    for (const w of orderDoc.dependency_warnings.slice(0, 5)) {
      push(String(w), "high");
    }
  }
  if (readinessDoc && Array.isArray(readinessDoc.warnings)) {
    for (const w of readinessDoc.warnings.slice(0, 5)) {
      push(String(w), "medium");
    }
  }
  return risks;
}

/**
 * @param {string} outputDir
 * @param {string} runId
 */
function collectStrategyBundle(outputDir, runId) {
  const dir = path.resolve(outputDir);
  const strategyDir = path.join(dir, STRATEGY_DIR);
  const ctx = safeReadJson(path.join(dir, "run-context.json"));
  const phase3 = ctx && ctx.phase3 && typeof ctx.phase3 === "object" ? ctx.phase3 : null;
  let phase3Status =
    phase3 && phase3.status != null
      ? String(phase3.status)
      : phase3 && phase3.phase_status != null
        ? String(phase3.phase_status)
        : null;

  const relPaths = listSubtaskFiles(strategyDir);
  const hasStrategyDir = fs.existsSync(strategyDir);
  const artifactHits = Object.values(FILES).filter((f) =>
    fs.existsSync(path.join(strategyDir, f)),
  ).length;

  if (!hasStrategyDir && !phase3 && relPaths.length === 0) {
    return {
      ok: true,
      data: buildEmptyStrategyBundle(runId, {
        source: "unsupported",
        unsupportedReason: "Corrida sem artifacts de strategy (phase3).",
        phase3Status,
      }),
    };
  }

  const complexityDoc = safeReadJson(path.join(strategyDir, FILES.complexity));
  const aiDoc = safeReadJson(path.join(strategyDir, FILES.ai));
  const decompositionDoc = safeReadJson(path.join(strategyDir, FILES.decomposition));
  const orderDoc = safeReadJson(path.join(strategyDir, FILES.order));
  const sharedDoc = safeReadJson(path.join(strategyDir, FILES.shared));
  const readinessDoc = safeReadJson(path.join(strategyDir, FILES.readiness));
  const handoffDoc = safeReadJson(path.join(strategyDir, "execution-ready-handoff.json"));

  const partial =
    relPaths.length === 0 ||
    !complexityDoc ||
    !aiDoc ||
    !orderDoc;

  let subtasks = mapSubtasks(dir, relPaths);
  const oesLoad = loadOrBuildOperationalExecutableStrategy(dir, {
    runId,
    writeIfBuilt: false,
  });
  const executableStrategy = mapOperationalExecutableStrategyDto(
    oesLoad.ok && oesLoad.artifact ? oesLoad.artifact : null,
    { degraded: Boolean(oesLoad.degraded) },
  );
  subtasks = enrichSubtasksFromOesDto(subtasks, executableStrategy);
  let ordering = mapOrdering(orderDoc, subtasks);
  ordering = enrichOrderingFromOesDto(ordering, executableStrategy);

  const readySubtaskCount = subtasks.filter((s) => s.readiness === "ready").length;
  const blockingCount = subtasks.filter((s) => s.readiness === "blocked").length;

  let operationalReadiness = "not_ready";
  if (readinessDoc) {
    const st = String(readinessDoc.status || "").toLowerCase();
    if (st.includes("ready")) operationalReadiness = "ready";
    else if (st.includes("partial") || st.includes("warning")) operationalReadiness = "partial";
  } else if (phase3Status === "ready_for_execution" || phase3Status === "strategy_ready") {
    operationalReadiness = blockingCount > 0 ? "partial" : readySubtaskCount > 0 ? "ready" : "partial";
  } else if (subtasks.length > 0) {
    operationalReadiness = "partial";
  }

  if (
    operationalReadiness === "ready" &&
    handoffDoc &&
    phase3Status === "strategy_runtime_initialized"
  ) {
    phase3Status = "strategy_ready";
  }

  const updatedAt =
    (readinessDoc && readinessDoc.updated_at != null
      ? String(readinessDoc.updated_at)
      : null) ||
    (orderDoc && orderDoc.generated_at != null ? String(orderDoc.generated_at) : null) ||
    (phase3 && phase3.updated_at != null ? String(phase3.updated_at) : null);

  const label =
    ctx && ctx.task && typeof ctx.task === "object" && ctx.task.title != null
      ? String(ctx.task.title)
      : runId;

  const source = partial ? "partial" : "runtime";

  return {
    ok: true,
    data: {
      summary: {
        runId,
        label,
        phase3Status,
        subtaskCount: subtasks.length,
        readySubtaskCount,
        blockingCount,
        operationalReadiness,
        updatedAt,
        source,
        unsupportedReason: partial
          ? "Strategy parcial — nem todos os artifacts phase3 estão presentes."
          : null,
      },
      complexity: mapComplexityDto(complexityDoc),
      recommendation: mapRecommendationDto(aiDoc),
      subtasks,
      ordering,
      sharedContext: mapSharedContext(sharedDoc),
      risks: mapRisks(complexityDoc, orderDoc, readinessDoc),
      executableStrategy,
      decompositionSummary:
        decompositionDoc && decompositionDoc.summary != null
          ? String(decompositionDoc.summary)
          : decompositionDoc && decompositionDoc.strategy != null
            ? `strategy=${String(decompositionDoc.strategy)}; subtasks=${decompositionDoc.subtask_count ?? subtasks.length}`
            : null,
      source,
      unsupportedReason: null,
    },
  };
}

/**
 * @param {string} runId
 * @param {{ source: string, unsupportedReason: string|null, phase3Status: string|null }} meta
 */
function buildEmptyStrategyBundle(runId, meta) {
  return {
    summary: {
      runId,
      label: runId,
      phase3Status: meta.phase3Status,
      subtaskCount: 0,
      readySubtaskCount: 0,
      blockingCount: 0,
      operationalReadiness: "not_ready",
      updatedAt: null,
      source: meta.source,
      unsupportedReason: meta.unsupportedReason,
    },
    complexity: mapComplexityDto(null),
    recommendation: mapRecommendationDto(null),
    subtasks: [],
    ordering: mapOrdering(null, []),
    sharedContext: mapSharedContext(null),
    risks: [],
    decompositionSummary: null,
    executableStrategy: mapOperationalExecutableStrategyDto(null),
    source: meta.source,
    unsupportedReason: meta.unsupportedReason,
  };
}

/**
 * @param {string} runId
 */
function collectStrategyForRun(runId) {
  let outputDir;
  try {
    outputDir = resolveOutputDir(runId, { warnLegacy: false });
  } catch (e) {
    const msg = e && e.message ? String(e.message) : "Output indisponível.";
    return { ok: false, error: { code: "output_unavailable", message: msg } };
  }
  return collectStrategyBundle(outputDir, runId);
}

module.exports = {
  collectStrategyForRun,
  collectStrategyBundle,
  FILES,
};
