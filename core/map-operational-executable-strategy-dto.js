"use strict";

/**
 * Projeção única: artefato OES → DTO consumido pelo frontend/API.
 * Evita heurísticas duplicadas em run-strategy e adapters.
 */

/**
 * @param {unknown} raw
 * @returns {"low"|"medium"|"high"}
 */
function level3(raw) {
  const k = String(raw || "").toLowerCase();
  if (k === "low") return "low";
  if (k === "high") return "high";
  return "medium";
}

/**
 * @param {unknown} raw
 * @returns {string[]}
 */
function asStrings(raw) {
  if (!Array.isArray(raw)) return [];
  return raw.map((x) => String(x || "").trim()).filter(Boolean);
}

/**
 * @param {unknown} raw
 */
function mapScope(raw) {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    return { summary: null, highlights: [] };
  }
  const o = /** @type {Record<string, unknown>} */ (raw);
  return {
    summary: o.summary != null ? String(o.summary).trim() || null : null,
    highlights: asStrings(o.highlights),
  };
}

/**
 * @param {unknown} raw
 */
function mapMiniTask(raw) {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const o = /** @type {Record<string, unknown>} */ (raw);
  const title = String(o.title || "").trim();
  if (!title) return null;
  return {
    id: String(o.id || "").trim(),
    subtaskId: o.subtaskId != null ? String(o.subtaskId).trim() || null : null,
    order: Number(o.order) > 0 ? Number(o.order) : 1,
    title,
    objective: String(o.objective || "").trim() || title,
    scope: mapScope(o.scope),
    affectedFiles: asStrings(o.affectedFiles),
    affectedDomains: asStrings(o.affectedDomains),
    dependsOnIds: asStrings(o.dependsOnIds),
    complexity: level3(o.complexity),
    risk: level3(o.risk),
    acceptanceCriteria: asStrings(o.acceptanceCriteria),
    completionCriteria: asStrings(o.completionCriteria),
    validationHints: asStrings(o.validationHints),
  };
}

/**
 * @param {unknown} raw
 */
function mapDependency(raw) {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const o = /** @type {Record<string, unknown>} */ (raw);
  const fromId = String(o.fromId || "").trim();
  const toId = String(o.toId || "").trim();
  if (!fromId || !toId) return null;
  const kindRaw = String(o.kind || "blocks");
  const kind =
    kindRaw === "requires" || kindRaw === "soft" || kindRaw === "blocks"
      ? kindRaw
      : "blocks";
  return {
    fromId,
    toId,
    label: String(o.label || `${toId} depende de ${fromId}`).trim(),
    kind,
  };
}

/**
 * @param {unknown} raw
 */
function mapExpectedImpact(raw) {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    return {
      affectedFiles: [],
      affectedComponents: [],
      affectedModules: [],
      structuralRisk: "medium",
      visualRisk: "medium",
      behaviorRisk: "medium",
      summary: null,
    };
  }
  const o = /** @type {Record<string, unknown>} */ (raw);
  return {
    affectedFiles: asStrings(o.affectedFiles),
    affectedComponents: asStrings(o.affectedComponents),
    affectedModules: asStrings(o.affectedModules),
    structuralRisk: level3(o.structuralRisk),
    visualRisk: level3(o.visualRisk),
    behaviorRisk: level3(o.behaviorRisk),
    summary: o.summary != null ? String(o.summary).trim() || null : null,
  };
}

/**
 * @param {Record<string, unknown>|null|undefined} artifact
 * @param {{ degraded?: boolean }} [meta]
 */
function mapOperationalExecutableStrategyDto(artifact, meta = {}) {
  if (!artifact) {
    return {
      available: false,
      degraded: true,
      version: 1,
      planVersion: "v1",
      sourcePlanVersion: "v1",
      strategySha256: null,
      orderingMode: "linear",
      executionPattern: "sequential_by_step",
      macroOrder: [],
      dependencies: [],
      validationApproach: "end_only",
      expectedImpact: mapExpectedImpact(null),
      miniTasks: [],
      approvalState: { approved: false, strategySha256: null },
    };
  }

  const approval =
    artifact.approvalState && typeof artifact.approvalState === "object"
      ? /** @type {Record<string, unknown>} */ (artifact.approvalState)
      : {};
  const strategySha256 =
    approval.strategySha256 != null
      ? String(approval.strategySha256).trim() || null
      : null;

  const miniTasksRaw = Array.isArray(artifact.miniTasks) ? artifact.miniTasks : [];
  const miniTasks = miniTasksRaw.map(mapMiniTask).filter(Boolean);

  const depsRaw = Array.isArray(artifact.dependencies) ? artifact.dependencies : [];
  const dependencies = depsRaw.map(mapDependency).filter(Boolean);

  const orderingModeRaw = String(artifact.orderingMode || "linear");
  const orderingMode =
    orderingModeRaw === "parallel" ||
    orderingModeRaw === "staged" ||
    orderingModeRaw === "linear"
      ? orderingModeRaw
      : "linear";

  return {
    available: true,
    degraded: meta.degraded === true,
    version: Number(artifact.version) > 0 ? Number(artifact.version) : 1,
    planVersion: String(artifact.planVersion || "v1"),
    sourcePlanVersion: String(artifact.sourcePlanVersion || artifact.planVersion || "v1"),
    strategySha256,
    orderingMode,
    executionPattern: String(artifact.executionPattern || "sequential_by_step"),
    macroOrder: asStrings(artifact.macroOrder),
    dependencies,
    validationApproach: String(artifact.validationApproach || "end_only"),
    expectedImpact: mapExpectedImpact(artifact.expectedImpact),
    miniTasks,
    approvalState: {
      approved: approval.approved === true,
      strategySha256,
    },
  };
}

/**
 * Enriquece subtasks do bundle legado com campos do OES (match por subtaskId).
 *
 * @param {Record<string, unknown>[]} subtasks
 * @param {ReturnType<typeof mapOperationalExecutableStrategyDto>} oesDto
 */
function enrichSubtasksFromOesDto(subtasks, oesDto) {
  if (!oesDto.available || !oesDto.miniTasks.length) return subtasks;

  /** @type {Map<string, Record<string, unknown>>} */
  const bySubtaskId = new Map();
  /** @type {Map<number, Record<string, unknown>>} */
  const byOrder = new Map();
  for (const mt of oesDto.miniTasks) {
    if (mt.subtaskId) bySubtaskId.set(mt.subtaskId, mt);
    byOrder.set(mt.order, mt);
  }

  return subtasks.map((st, idx) => {
    const sid = String(st.id || "").trim();
    const mt =
      bySubtaskId.get(sid) ||
      byOrder.get(typeof st.order === "number" ? st.order : idx + 1) ||
      null;
    if (!mt) return st;

    return {
      ...st,
      miniTaskId: mt.id || null,
      objective: mt.objective,
      scope: mt.scope,
      affectedFiles: mt.affectedFiles,
      affectedDomains: mt.affectedDomains,
      dependsOn: st.dependsOn && st.dependsOn.length ? st.dependsOn : [],
      dependsOnMiniTaskIds: mt.dependsOnIds,
      complexity: mt.complexity,
      risk: mt.risk,
      acceptanceCriteria: mt.acceptanceCriteria,
      completionCriteria: mt.completionCriteria,
      validationHints: mt.validationHints,
    };
  });
}

/**
 * Sincroniza ordering.blockingDependencies com labels humanas do OES.
 *
 * @param {Record<string, unknown>} ordering
 * @param {ReturnType<typeof mapOperationalExecutableStrategyDto>} oesDto
 */
function enrichOrderingFromOesDto(ordering, oesDto) {
  if (!oesDto.available || !oesDto.dependencies.length) return ordering;
  return {
    ...ordering,
    orderingMode: oesDto.orderingMode,
    blockingDependencies: oesDto.dependencies.map((d) => ({
      from: d.fromId,
      to: d.toId,
      label: d.label,
    })),
  };
}

module.exports = {
  mapOperationalExecutableStrategyDto,
  enrichSubtasksFromOesDto,
  enrichOrderingFromOesDto,
};
