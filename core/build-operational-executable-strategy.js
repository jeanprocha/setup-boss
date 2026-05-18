"use strict";

const crypto = require("crypto");
const fs = require("fs");
const path = require("path");

const OES_VERSION = 1;
const PROJECTION_VERSION = "1.0.0";
const OPERATIONAL_EXECUTABLE_STRATEGY_REL =
  "strategy/operational-executable-strategy.json";
const PLAN_REFINED = "task-plan-refined.md";
const SUBTASKS_DIR = "subtasks";

/** Campos excluídos do fingerprint estável. */
const HASH_EXCLUDE_TOP = new Set([
  "approvalState",
  "generatedAt",
  "provenance",
  "runId",
  "sourcePlanSha256",
]);

/**
 * @param {string} title
 */
function slugifyTitle(title) {
  const s = String(title || "task")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48);
  return s || "task";
}

/**
 * @param {number} order
 * @param {string} title
 */
function buildMiniTaskId(order, title) {
  const ord = String(Math.max(1, Math.floor(order))).padStart(3, "0");
  return `mini-${ord}-${slugifyTitle(title)}`;
}

/**
 * @param {number} n
 * @param {number} lo
 * @param {number} hi
 */
function clampInt(n, lo, hi) {
  const x = Math.round(Number(n));
  if (!Number.isFinite(x)) return lo;
  return Math.max(lo, Math.min(hi, x));
}

/**
 * @param {number|null|undefined} score
 * @returns {"low"|"medium"|"high"}
 */
function scoreToLevel(score) {
  const s = Number(score);
  if (!Number.isFinite(s)) return "medium";
  if (s <= 3) return "low";
  if (s >= 7) return "high";
  return "medium";
}

/**
 * @param {unknown} v
 * @returns {v is Record<string, unknown>}
 */
function isPlainObject(v) {
  return Boolean(v) && typeof v === "object" && !Array.isArray(v);
}

/**
 * @param {string} fp
 * @returns {Record<string, unknown>|null}
 */
function readJsonObject(fp) {
  try {
    if (!fs.existsSync(fp)) return null;
    const raw = fs.readFileSync(fp, "utf-8");
    const j = JSON.parse(raw);
    return isPlainObject(j) ? j : null;
  } catch {
    return null;
  }
}

/**
 * @param {string} text
 * @returns {string[]}
 */
function extractFilePathsFromText(text) {
  const out = new Set();
  const re = /`([^`]+)`/g;
  let m;
  while ((m = re.exec(String(text || ""))) !== null) {
    const inner = String(m[1] || "").trim();
    if (
      /[/\\]/.test(inner) ||
      /\.(js|ts|tsx|jsx|mjs|cjs|json|md|yml|yaml|toml|xml|html|css|scss)$/i.test(
        inner,
      )
    ) {
      out.add(inner.replace(/\\/g, "/"));
    }
  }
  return [...out];
}

/**
 * @param {string} fp
 * @returns {string}
 */
function domainFromPath(fp) {
  const p = String(fp || "").replace(/\\/g, "/").replace(/^\/+/, "");
  const i = p.indexOf("/");
  return i === -1 ? p || "root" : p.slice(0, i) || "root";
}

/**
 * @param {string} title
 */
function normalizeSectionTitle(title) {
  return String(title || "")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

/**
 * @param {string} md
 * @returns {{ title: string, body: string }[]}
 */
function parseMarkdownSections(md) {
  const lines = String(md || "").split(/\r?\n/);
  /** @type {{ title: string, body: string[] }[]} */
  const chunks = [];
  let cur = null;
  for (const line of lines) {
    const m = /^##\s+(.+)$/.exec(line);
    if (m) {
      if (cur) chunks.push({ title: cur.title, body: cur.body.join("\n").trim() });
      cur = { title: m[1].trim(), body: [] };
    } else if (cur) {
      cur.body.push(line);
    }
  }
  if (cur) chunks.push({ title: cur.title, body: cur.body.join("\n").trim() });
  return chunks.map((c) => ({ title: c.title, body: c.body }));
}

/**
 * @param {string} body
 * @returns {string[]}
 */
function bulletsFromBody(body) {
  return String(body || "")
    .split("\n")
    .map((l) => l.replace(/^[-*•]\s+/, "").replace(/^\d+\.\s+/, "").trim())
    .filter((l) => l.length > 0)
    .slice(0, 12);
}

/**
 * @param {string} md
 */
function parsePlanFallbacks(md) {
  const sections = parseMarkdownSections(md);
  /** @type {string[]} */
  let executionOrder = [];
  /** @type {string[]} */
  let completionCriteria = [];
  /** @type {string[]} */
  let risks = [];
  let objective = "";

  for (const { title, body } of sections) {
    const norm = normalizeSectionTitle(title);
    if (norm === "objetivo" && !objective) {
      objective = String(body || "").trim().slice(0, 2000);
    }
    if (
      norm === "passos propostos" ||
      norm === "passos" ||
      norm.startsWith("passos ")
    ) {
      executionOrder = bulletsFromBody(body);
    }
    if (
      norm.includes("criterio") ||
      norm.includes("critério") ||
      norm.includes("aceite")
    ) {
      completionCriteria = bulletsFromBody(body);
    }
    if (norm.startsWith("risco")) {
      risks = bulletsFromBody(body);
    }
  }

  const planFiles = extractFilePathsFromText(md);
  return { executionOrder, completionCriteria, risks, objective, planFiles };
}

/**
 * @param {string[]} files
 * @param {string[]} domains
 */
function inferAffectedComponents(files, domains) {
  /** @type {Set<string>} */
  const out = new Set();

  for (const fp of files) {
    const norm = String(fp || "").replace(/\\/g, "/");
    const base = path.basename(norm);
    const parts = norm.split("/").filter(Boolean);

    const compIdx = parts.findIndex((p) => /^components?$/i.test(p));
    if (compIdx >= 0 && parts[compIdx + 1]) {
      const name = parts[compIdx + 1].replace(/\.(tsx|jsx|ts|js)$/i, "");
      if (name && !/^(index|page|layout)$/i.test(name)) out.add(name);
    }

    if (/^[A-Z][A-Za-z0-9]+(?:\.(tsx|jsx))?$/.test(base)) {
      out.add(base.replace(/\.(tsx|jsx|ts|js)$/i, ""));
    }

    if (/components?\//i.test(norm)) {
      const m = norm.match(/components?\/([^/]+)/i);
      if (m && m[1]) out.add(m[1].replace(/\.(tsx|jsx)$/i, ""));
    }
  }

  for (const d of domains) {
    const dom = String(d || "").trim();
    if (!dom || dom === "root" || dom === "validation") continue;
    if (/^[a-z][a-z0-9-]*$/i.test(dom) && dom.length <= 32) out.add(dom);
  }

  return [...out].sort((a, b) => a.localeCompare(b)).slice(0, 24);
}

/**
 * @param {string} planText
 * @param {Record<string, unknown>|null} complexityDoc
 */
function inferImpactRisks(planText, complexityDoc) {
  const lower = String(planText || "").toLowerCase();
  let visualRisk = "low";
  let structuralRisk = "medium";
  let behaviorRisk = "medium";

  if (
    /\b(ui|ux|layout|css|tailwind|visual|componente|tela|chat|dark mode|responsiv)/i.test(
      lower,
    )
  ) {
    visualRisk = "medium";
  }
  if (/\b(refator|arquitetura|runtime|orchestrat|pipeline|breaking|api)\b/i.test(lower)) {
    structuralRisk = "high";
  }
  if (/\b(auth|segurança|seguranca|permission|governance)\b/i.test(lower)) {
    behaviorRisk = "high";
  }

  const scores =
    complexityDoc && isPlainObject(complexityDoc.scores)
      ? complexityDoc.scores
      : null;
  if (scores) {
    const risk = Number(scores.risk);
    const overall = Number(scores.overall);
    if (Number.isFinite(risk) && risk >= 7) {
      structuralRisk = "high";
      behaviorRisk = "high";
    } else if (Number.isFinite(overall) && overall <= 3) {
      structuralRisk = "low";
      behaviorRisk = "low";
    }
  }

  return {
    structuralRisk,
    visualRisk,
    behaviorRisk,
  };
}

/**
 * @param {string|null} decompositionStrategy
 * @param {number} miniTaskCount
 */
function mapExecutionPattern(decompositionStrategy, miniTaskCount) {
  const s = String(decompositionStrategy || "").trim();
  if (s === "single") return "single_pass";
  if (s === "section_based") return "sequential_by_step";
  if (s === "file_group_based") return "by_component";
  if (s === "risk_based") return "incremental_validate";
  if (miniTaskCount <= 1) return "single_pass";
  return "sequential_by_step";
}

/**
 * @param {number} miniTaskCount
 * @param {string} planText
 */
function deriveValidationApproach(miniTaskCount, planText) {
  const lower = String(planText || "").toLowerCase();
  if (/\b(validação visual|validacao visual|smoke visual)\b/i.test(lower)) {
    return "visual_smoke";
  }
  if (miniTaskCount > 1) return "per_mini_task";
  return "end_only";
}

/**
 * @param {string} strategyDirAbs
 * @returns {{
 *   subtaskId: string,
 *   doc: Record<string, unknown>,
 *   filePath: string,
 * }[]}
 */
function loadSubtaskDocs(strategyDirAbs) {
  const subtasksDir = path.join(strategyDirAbs, SUBTASKS_DIR);
  if (!fs.existsSync(subtasksDir)) return [];

  /** @type {string[]} */
  const files = [];
  try {
    for (const name of fs.readdirSync(subtasksDir)) {
      if (/^\d{3}\.json$/i.test(name)) files.push(name);
    }
  } catch {
    return [];
  }

  files.sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));

  return files.map((name) => {
    const subtaskId = name.replace(/\.json$/i, "");
    const filePath = path.join(subtasksDir, name);
    const doc = readJsonObject(filePath) || {};
    return { subtaskId, doc, filePath };
  });
}

/**
 * @param {Record<string, unknown>|null} orderDoc
 * @param {string[]} defaultOrder
 */
function resolveMacroOrderSubtaskIds(orderDoc, defaultOrder) {
  if (orderDoc && Array.isArray(orderDoc.ordered_subtasks)) {
    const ids = orderDoc.ordered_subtasks
      .map((row) => {
        if (!isPlainObject(row)) return "";
        return String(row.subtask_id || "").trim();
      })
      .filter((id) => /^\d{3}$/.test(id));
    if (ids.length) return ids;
  }
  return defaultOrder;
}

/**
 * @param {unknown} raw
 * @returns {string[]}
 */
function asStringArray(raw) {
  if (!Array.isArray(raw)) return [];
  return raw.map((x) => String(x || "").trim()).filter(Boolean);
}

/**
 * @param {Record<string, unknown>} doc
 */
function readSubtaskScope(doc) {
  const scope = isPlainObject(doc.scope) ? doc.scope : {};
  const files = asStringArray(scope.files);
  const domains = asStringArray(scope.domains);
  return { files, domains, scope };
}

/**
 * @param {string} subtaskId
 * @param {Map<string, string>} idMap
 */
function mapDependsToMiniIds(subtaskId, doc, idMap) {
  const deps = asStringArray(doc.dependencies).filter((d) => /^\d{3}$/.test(d));
  return deps
    .filter((d) => d !== subtaskId)
    .map((d) => idMap.get(d))
    .filter((x) => typeof x === "string" && x.length > 0);
}

/**
 * @param {string} title
 */
function isValidationSubtaskTitle(title) {
  const n = normalizeSectionTitle(title);
  return (
    n.includes("valid") ||
    n.includes("validação") ||
    n.includes("validacao") ||
    n.includes("teste")
  );
}

/**
 * @param {unknown} value
 * @returns {unknown}
 */
function stableNormalize(value) {
  if (value === null || typeof value !== "object") return value;
  if (Array.isArray(value)) return value.map(stableNormalize);
  if (!isPlainObject(value)) return value;
  const keys = Object.keys(value).sort();
  /** @type {Record<string, unknown>} */
  const out = {};
  for (const k of keys) {
    out[k] = stableNormalize(value[k]);
  }
  return out;
}

/**
 * @param {unknown} value
 */
function stableStringify(value) {
  return JSON.stringify(stableNormalize(value));
}

/**
 * @param {Record<string, unknown>} artifact
 */
function computeStrategySha256(artifact) {
  /** @type {Record<string, unknown>} */
  const payload = {};
  for (const [k, v] of Object.entries(artifact)) {
    if (HASH_EXCLUDE_TOP.has(k)) continue;
    payload[k] = v;
  }
  return crypto
    .createHash("sha256")
    .update(stableStringify(payload), "utf8")
    .digest("hex");
}

/**
 * @param {number} planVersionNum
 */
function formatPlanVersionLabel(planVersionNum) {
  const n = Math.max(1, Math.floor(Number(planVersionNum) || 1));
  return `v${n}`;
}

/**
/**
 * @param {Record<string, unknown>} doc
 * @param {{ catalog?: { projectId: string, repositoryName: string, repositorySlug: string }[] }|null} workspaceContext
 */
function readSubtaskProjectFields(doc, workspaceContext) {
  const projectId =
    doc.projectId != null && String(doc.projectId).trim()
      ? String(doc.projectId).trim()
      : workspaceContext?.catalog?.[0]?.projectId || null;
  const catalogEntry =
    workspaceContext?.catalog?.find((c) => c.projectId === projectId) || null;
  const repositoryName =
    doc.repositoryName != null && String(doc.repositoryName).trim()
      ? String(doc.repositoryName).trim()
      : catalogEntry?.repositoryName || null;
  const repositorySlug =
    doc.repositorySlug != null && String(doc.repositorySlug).trim()
      ? String(doc.repositorySlug).trim()
      : catalogEntry?.repositorySlug || null;
  const integrationPoints = asStringArray(doc.integrationPoints);
  return {
    projectId,
    repositoryName,
    repositorySlug,
    integrationPoints,
  };
}

/**
 * @param {{
 *   outputDirAbs: string,
 *   runId?: string|null,
 *   planVersion?: number,
 *   sourcePlanVersion?: number,
 *   write?: boolean,
 *   workspaceContext?: {
 *     workspaceRunId: string,
 *     workspaceId: string,
 *     projectIds: string[],
 *     multiRepo: boolean,
 *     catalog: { projectId: string, repositoryName: string, repositorySlug: string }[],
 *   }|null,
 * }} input
 */
function buildOperationalExecutableStrategy(input) {
  const workspaceContext =
    input.workspaceContext && typeof input.workspaceContext === "object"
      ? input.workspaceContext
      : null;
  const outputDirAbs = path.resolve(String(input.outputDirAbs || ""));
  const strategyDirAbs = path.join(outputDirAbs, "strategy");
  const planVersionNum =
    input.planVersion != null
      ? Math.max(1, Math.floor(Number(input.planVersion)))
      : input.sourcePlanVersion != null
        ? Math.max(1, Math.floor(Number(input.sourcePlanVersion)))
        : 1;
  const sourcePlanVersionNum =
    input.sourcePlanVersion != null
      ? Math.max(1, Math.floor(Number(input.sourcePlanVersion)))
      : planVersionNum;
  const planVersion = formatPlanVersionLabel(planVersionNum);
  const sourcePlanVersion = formatPlanVersionLabel(sourcePlanVersionNum);

  /** @type {string[]} */
  const warnings = [];

  let planText = "";
  const planPath = path.join(outputDirAbs, PLAN_REFINED);
  try {
    if (fs.existsSync(planPath)) planText = fs.readFileSync(planPath, "utf-8");
  } catch (e) {
    warnings.push(
      `Não foi possível ler ${PLAN_REFINED}: ${e && e.message ? e.message : String(e)}`,
    );
  }

  const planFallbacks = parsePlanFallbacks(planText);
  const orderDoc = readJsonObject(
    path.join(strategyDirAbs, "execution-order.json"),
  );
  const aiDoc = readJsonObject(path.join(strategyDirAbs, "ai-strategy.json"));
  const decompositionDoc = readJsonObject(
    path.join(strategyDirAbs, "decomposition.json"),
  );
  const complexityDoc = readJsonObject(
    path.join(strategyDirAbs, "complexity-analysis.json"),
  );

  const subtaskRows = loadSubtaskDocs(strategyDirAbs);
  const defaultSubtaskOrder = subtaskRows.map((r) => r.subtaskId);
  const macroOrderSubtaskIds = resolveMacroOrderSubtaskIds(
    orderDoc,
    defaultSubtaskOrder,
  );

  const orderingModeRaw = orderDoc ? String(orderDoc.ordering_mode || "") : "";
  const orderingMode =
    orderingModeRaw === "parallel" ||
    orderingModeRaw === "staged" ||
    orderingModeRaw === "linear"
      ? orderingModeRaw
      : "linear";

  if (orderDoc && Array.isArray(orderDoc.dependency_warnings)) {
    for (const w of orderDoc.dependency_warnings.slice(0, 8)) {
      warnings.push(String(w));
    }
  }

  /** @type {Map<string, { subtaskId: string, doc: Record<string, unknown>, order: number, title: string }>} */
  const bySubtaskId = new Map();
  for (const row of subtaskRows) {
    bySubtaskId.set(row.subtaskId, {
      subtaskId: row.subtaskId,
      doc: row.doc,
      order: 0,
      title: String(row.doc.title || row.subtaskId).trim(),
    });
  }

  /** @type {Map<string, string>} */
  const subtaskToMiniId = new Map();
  let orderCounter = 0;
  for (const sid of macroOrderSubtaskIds) {
    const row = bySubtaskId.get(sid);
    if (!row) continue;
    orderCounter += 1;
    row.order = orderCounter;
    subtaskToMiniId.set(sid, buildMiniTaskId(orderCounter, row.title));
  }

  for (const row of subtaskRows) {
    if (!subtaskToMiniId.has(row.subtaskId)) {
      orderCounter += 1;
      const title = String(row.doc.title || row.subtaskId).trim();
      subtaskToMiniId.set(row.subtaskId, buildMiniTaskId(orderCounter, title));
      bySubtaskId.set(row.subtaskId, {
        subtaskId: row.subtaskId,
        doc: row.doc,
        order: orderCounter,
        title,
      });
    }
  }

  /** @type {string[]} */
  const macroOrder = [];
  /** @type {Record<string, unknown>[]} */
  const miniTasks = [];

  const globalCompletion =
    planFallbacks.completionCriteria.length > 0
      ? planFallbacks.completionCriteria
      : ["Entrega alinhada ao plano aprovado.", "Sem regressões conhecidas nas áreas tocadas."];

  for (const sid of macroOrderSubtaskIds.length
    ? macroOrderSubtaskIds
    : [...subtaskToMiniId.keys()].sort()) {
    const meta = bySubtaskId.get(sid);
    if (!meta) continue;
    const miniId = subtaskToMiniId.get(sid);
    if (!miniId) continue;

    const doc = meta.doc;
    const title =
      String(doc.title || meta.title || sid).trim() || `Etapa ${meta.order}`;
    const objectiveRaw = String(doc.goal || "").trim();
    const objective =
      objectiveRaw ||
      (planFallbacks.objective
        ? planFallbacks.objective.slice(0, 400)
        : `Executar: ${title}.`);

    const { files, domains, scope: scopeObj } = readSubtaskScope(doc);
    const planFilesForTask = files.length ? files : extractFilePathsFromText(planText);
    const affectedDomains =
      domains.length > 0
        ? domains
        : [...new Set(planFilesForTask.map(domainFromPath))].filter(Boolean);

    const complexityDoc =
      isPlainObject(doc.complexity) ? doc.complexity : {};
    const complexity = scoreToLevel(complexityDoc.estimated_score);
    const risk = scoreToLevel(complexityDoc.risk);

    const acceptanceCriteria = asStringArray(doc.acceptance_criteria);
    const acceptance =
      acceptanceCriteria.length > 0
        ? acceptanceCriteria
        : globalCompletion.slice(0, 4);

    const completionCriteria = [...acceptance];
    if (
      globalCompletion.length &&
      !completionCriteria.some((c) => globalCompletion[0] === c)
    ) {
      completionCriteria.push(globalCompletion[0]);
    }

    /** @type {string[]} */
    const validationHints = [];
    if (isValidationSubtaskTitle(title)) {
      validationHints.push("Executar verificações e validação desta etapa antes de avançar.");
    }
    if (affectedDomains.includes("frontend") || /\b(ui|visual|css)\b/i.test(title)) {
      validationHints.push("Validar visualmente no browser após a alteração.");
    }
    if (planFilesForTask.some((f) => /\.test\.(js|ts|tsx)$/i.test(f))) {
      validationHints.push("Correr testes associados aos ficheiros alterados.");
    }

    const dependsOnIds = mapDependsToMiniIds(sid, doc, subtaskToMiniId);
    const projectFields = readSubtaskProjectFields(doc, workspaceContext);
    const affectedComponentsList = inferAffectedComponents(
      planFilesForTask,
      affectedDomains,
    );

    const scopeSummary =
      String(scopeObj.summary || "").trim() ||
      (acceptance[0] ? acceptance[0].slice(0, 280) : null) ||
      "Conforme descrito no plano aprovado.";

    miniTasks.push({
      id: miniId,
      subtaskId: sid,
      order: meta.order,
      title,
      objective,
      projectId: projectFields.projectId,
      repositoryName: projectFields.repositoryName,
      repositorySlug: projectFields.repositorySlug,
      scope: {
        summary: scopeSummary,
        highlights: acceptance.slice(0, 4),
      },
      affectedFiles: planFilesForTask.slice(0, 32),
      affectedComponents: affectedComponentsList.slice(0, 16),
      affectedDomains: affectedDomains.slice(0, 16),
      dependsOnIds,
      integrationPoints: projectFields.integrationPoints.slice(0, 6),
      complexity,
      risk,
      acceptanceCriteria: acceptance,
      completionCriteria: completionCriteria.slice(0, 8),
      validationHints: validationHints.slice(0, 6),
    });

    macroOrder.push(miniId);
  }

  /** @type {Record<string, unknown>[]} */
  const dependencies = [];
  for (const mt of miniTasks) {
    const toId = String(mt.id);
    const deps = Array.isArray(mt.dependsOnIds) ? mt.dependsOnIds : [];
    for (const fromId of deps) {
      const fromTask = miniTasks.find((t) => t.id === fromId);
      const fromTitle = fromTask ? String(fromTask.title) : fromId;
      const toTitle = String(mt.title);
      dependencies.push({
        fromId,
        toId,
        label: `${toTitle} depende de ${fromTitle}`,
        kind: "blocks",
      });
    }
  }

  const decompositionStrategy = decompositionDoc
    ? String(decompositionDoc.strategy || "")
    : "";
  const executionPattern = mapExecutionPattern(
    decompositionStrategy,
    miniTasks.length,
  );
  const validationApproach = deriveValidationApproach(
    miniTasks.length,
    planText,
  );

  /** @type {Set<string>} */
  const allFiles = new Set(planFallbacks.planFiles);
  for (const mt of miniTasks) {
    for (const f of asStringArray(mt.affectedFiles)) allFiles.add(f);
  }

  const allFilesArr = [...allFiles].sort();
  const allDomains = [
    ...new Set(
      miniTasks.flatMap((mt) => asStringArray(mt.affectedDomains)),
    ),
  ].sort();

  const impactRisks = inferImpactRisks(planText, complexityDoc);

  const degraded =
    subtaskRows.length === 0 &&
    !orderDoc &&
    !aiDoc &&
    miniTasks.length === 0;

  if (degraded && planFallbacks.executionOrder.length) {
    let fbOrder = 0;
    for (const step of planFallbacks.executionOrder.slice(0, 8)) {
      fbOrder += 1;
      const miniId = buildMiniTaskId(fbOrder, step);
      miniTasks.push({
        id: miniId,
        subtaskId: null,
        order: fbOrder,
        title: step,
        objective: step,
        scope: {
          summary: "Derivado dos passos do plano refinado.",
          highlights: [],
        },
        affectedFiles: allFilesArr.slice(0, 16),
        affectedDomains: allDomains.slice(0, 8),
        dependsOnIds: [],
        complexity: "medium",
        risk: "medium",
        acceptanceCriteria: globalCompletion.slice(0, 3),
        completionCriteria: globalCompletion.slice(0, 4),
        validationHints: [],
      });
      macroOrder.push(miniId);
    }
    warnings.push(
      "Estratégia degradada: sem subtasks técnicas; ordem derivada do plano refinado.",
    );
  }

  if (degraded && miniTasks.length === 0) {
    warnings.push(
      "Run legado sem strategy/subtasks: artefato OES mínimo sem mini-tarefas.",
    );
  }

  const affectedComponents = inferAffectedComponents(allFilesArr, allDomains);

  const expectedImpact = {
    affectedFiles: allFilesArr.slice(0, 48),
    affectedComponents,
    affectedModules: allDomains.slice(0, 24),
    structuralRisk: impactRisks.structuralRisk,
    visualRisk: impactRisks.visualRisk,
    behaviorRisk: impactRisks.behaviorRisk,
    summary: planFallbacks.objective
      ? planFallbacks.objective.slice(0, 500)
      : null,
  };

  const runId =
    input.runId != null && String(input.runId).trim()
      ? String(input.runId).trim()
      : path.basename(outputDirAbs);

  const integrationFlow = workspaceContext?.multiRepo
    ? {
        pattern: executionPattern,
        projectOrder: [
          ...new Set(
            miniTasks
              .map((mt) => (mt.projectId != null ? String(mt.projectId) : ""))
              .filter(Boolean),
          ),
        ],
        workspaceRunId: workspaceContext.workspaceRunId,
        workspaceId: workspaceContext.workspaceId,
      }
    : null;

  /** @type {Record<string, unknown>} */
  const artifact = {
    version: OES_VERSION,
    planVersion,
    sourcePlanVersion,
    runId,
    generatedAt: new Date().toISOString(),
    orderingMode,
    executionPattern,
    macroOrder,
    dependencies,
    validationApproach,
    expectedImpact,
    miniTasks,
    multiRepo: Boolean(workspaceContext?.multiRepo),
    integrationFlow,
    provenance: {
      projectionVersion: PROJECTION_VERSION,
      decompositionStrategy: decompositionStrategy || null,
      artifacts: [
        ...(subtaskRows.length ? [`strategy/${SUBTASKS_DIR}/*.json`] : []),
        orderDoc ? "strategy/execution-order.json" : null,
        aiDoc ? "strategy/ai-strategy.json" : null,
        decompositionDoc ? "strategy/decomposition.json" : null,
        complexityDoc ? "strategy/complexity-analysis.json" : null,
        fs.existsSync(planPath) ? PLAN_REFINED : null,
      ].filter(Boolean),
      warnings: warnings.slice(0, 16),
    },
    approvalState: {
      approved: false,
      strategySha256: "",
    },
  };

  const strategySha256 = computeStrategySha256(artifact);
  artifact.approvalState = {
    approved: false,
    strategySha256,
  };

  const result = {
    ok: true,
    degraded: degraded && subtaskRows.length === 0,
    artifact,
    warnings,
    relPath: OPERATIONAL_EXECUTABLE_STRATEGY_REL,
  };

  if (input.write) {
    const writeResult = writeOperationalExecutableStrategy(outputDirAbs, {
      artifact,
    });
    result.written = writeResult.written;
    result.writePath = writeResult.path;
  }

  return result;
}

/**
 * @param {string} outputDirAbs
 * @param {{ artifact: Record<string, unknown> }} p
 */
function writeOperationalExecutableStrategy(outputDirAbs, p) {
  const root = path.resolve(outputDirAbs);
  const outPath = path.join(root, OPERATIONAL_EXECUTABLE_STRATEGY_REL);
  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  fs.writeFileSync(outPath, JSON.stringify(p.artifact, null, 2), "utf-8");
  return { written: true, path: outPath, relPath: OPERATIONAL_EXECUTABLE_STRATEGY_REL };
}

module.exports = {
  OES_VERSION,
  PROJECTION_VERSION,
  OPERATIONAL_EXECUTABLE_STRATEGY_REL,
  buildOperationalExecutableStrategy,
  writeOperationalExecutableStrategy,
  computeStrategySha256,
  stableStringify,
  buildMiniTaskId,
  slugifyTitle,
  inferAffectedComponents,
};
