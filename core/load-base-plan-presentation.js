"use strict";

const fs = require("fs");
const path = require("path");

const { parseTaskPlanMarkdown } = require("./parse-task-plan-markdown.js");
const { buildPlanExcerptFromPresentation } = require("./build-plan-excerpt-from-presentation.js");
const {
  filterOperationalPlanLines,
  isInternalOperationalLine,
} = require("./sanitize-operational-plan-content.js");
const {
  sanitizeUpdatedPlanPresentation,
} = require("./generate-full-updated-plan-presentation.js");
const {
  loadOrBuildOperationalExecutableStrategy,
} = require("./load-operational-executable-strategy.js");
const {
  readPlanPresentationBaseSnapshot,
  writePlanPresentationBaseSnapshot,
} = require("./plan-presentation-base-snapshot.js");

const PLAN_CANDIDATES = [
  "task-plan-refined.md",
  "task-plan-initial.md",
  path.join("strategy", "task-plan-strategy.md"),
];

const CLARIFICATION_ANSWERS = "clarification-answers.json";

/**
 * @param {string} outputDir
 */
function readPlanMarkdown(outputDir) {
  const dir = path.resolve(String(outputDir || ""));
  for (const rel of PLAN_CANDIDATES) {
    const fp = path.join(dir, rel);
    if (!fs.existsSync(fp)) continue;
    try {
      return String(fs.readFileSync(fp, "utf-8"))
        .replace(/<!--[\s\S]*?-->/g, "")
        .trim();
    } catch {
      /* */
    }
  }
  return "";
}

const UPDATED_PLAN_FILE = "updated-plan.json";
const COMMENTS_ROOT = "plan-comments";

/**
 * @param {string} outputDir
 * @param {string} [excludeCommentId]
 */
function findLatestUpdatedPresentation(outputDir, excludeCommentId) {
  const root = path.join(path.resolve(outputDir), COMMENTS_ROOT);
  if (!fs.existsSync(root)) return null;

  let bestVersion = 0;
  /** @type {object|null} */
  let bestPresentation = null;

  for (const name of fs.readdirSync(root)) {
    if (excludeCommentId && name === excludeCommentId) continue;
    const fp = path.join(root, name, UPDATED_PLAN_FILE);
    if (!fs.existsSync(fp)) continue;
    try {
      const doc = JSON.parse(fs.readFileSync(fp, "utf-8"));
      const pv = Number(doc?.planVersion);
      const pres = doc?.presentation;
      if (!pres || typeof pres !== "object") continue;
      if (!Number.isFinite(pv) || pv < bestVersion) continue;
      bestVersion = pv;
      bestPresentation = sanitizeUpdatedPlanPresentation(pres);
    } catch {
      /* */
    }
  }
  return bestPresentation;
}

/**
 * @param {string} outputDir
 */
function loadClarificationAnswerHints(outputDir) {
  const fp = path.join(path.resolve(outputDir), CLARIFICATION_ANSWERS);
  if (!fs.existsSync(fp)) return { objective: null, scopeHints: [], criteriaHints: [], outOfScopeHints: [] };
  try {
    const doc = JSON.parse(fs.readFileSync(fp, "utf-8"));
    const answers = Array.isArray(doc?.answers) ? doc.answers : [];
    /** @type {string[]} */
    const scopeHints = [];
    /** @type {string[]} */
    const criteriaHints = [];
    /** @type {string[]} */
    const outOfScopeHints = [];
    let objective = null;

    for (const row of answers) {
      const q = String(row.question || row.question_text || "").toLowerCase();
      const a = String(row.answer || row.value || "").trim();
      if (!a) continue;
      if (/objetivo|meta|finalidade/.test(q)) objective = a;
      if (/escopo|incluir|entregar|fazer/.test(q)) scopeHints.push(a);
      if (/crit[eé]rio|aceite|conclus/.test(q)) criteriaHints.push(a);
      if (/fora|excluir|n[aã]o\s+incluir/.test(q)) outOfScopeHints.push(a);
    }
    return { objective, scopeHints, criteriaHints, outOfScopeHints };
  } catch {
    return { objective: null, scopeHints: [], criteriaHints: [], outOfScopeHints: [] };
  }
}

/**
 * @param {string} outputDir
 * @param {ReturnType<typeof parseTaskPlanMarkdown>} parsed
 * @param {ReturnType<typeof loadClarificationAnswerHints>} clar
 */
function buildPresentationFromSources(outputDir, parsed, clar) {
  const rawObjective =
    clar.objective?.trim() ||
    parsed.objective?.trim() ||
    null;
  const mainObjective =
    rawObjective && !isInternalOperationalLine(rawObjective) ? rawObjective : null;

  /** @type {string[]} */
  let whatWillBeDone = filterOperationalPlanLines([...parsed.executionOrder]);
  for (const hint of clar.scopeHints) {
    if (
      hint.length >= 6 &&
      !isInternalOperationalLine(hint) &&
      !whatWillBeDone.some((x) => x.toLowerCase() === hint.toLowerCase())
    ) {
      whatWillBeDone.push(hint);
    }
  }
  whatWillBeDone = filterOperationalPlanLines(whatWillBeDone);

  /** @type {string[]} */
  let outOfScope = filterOperationalPlanLines([...parsed.outOfScope]);
  for (const hint of clar.outOfScopeHints) {
    if (
      hint.length >= 4 &&
      !isInternalOperationalLine(hint) &&
      !outOfScope.some((x) => x.toLowerCase() === hint.toLowerCase())
    ) {
      outOfScope.push(hint);
    }
  }
  outOfScope = filterOperationalPlanLines(outOfScope);

  /** @type {string[]} */
  let completionCriteria = filterOperationalPlanLines([...parsed.completionCriteria]);
  for (const hint of clar.criteriaHints) {
    if (
      hint.length >= 6 &&
      !isInternalOperationalLine(hint) &&
      !completionCriteria.some((x) => x.toLowerCase() === hint.toLowerCase())
    ) {
      completionCriteria.push(hint);
    }
  }
  completionCriteria = filterOperationalPlanLines(completionCriteria);

  /** @type {Array<{ id: string, title: string, order: number }>} */
  const miniTaskRows = [];
  try {
    const oesLoad = loadOrBuildOperationalExecutableStrategy(path.resolve(outputDir), {
      writeIfBuilt: false,
    });
    const artifact = oesLoad?.artifact;
    const raw = Array.isArray(artifact?.miniTasks) ? artifact.miniTasks : [];
    for (let i = 0; i < raw.length; i++) {
      const mt = raw[i];
      const title = String(mt?.title || "").trim();
      if (!title || isInternalOperationalLine(title)) continue;
      miniTaskRows.push({
        id: String(mt.id || `mt-${i + 1}`),
        title,
        order: Number(mt.order) > 0 ? Number(mt.order) : i + 1,
      });
    }
  } catch {
    /* OES opcional */
  }

  const riskLabels = filterOperationalPlanLines(parsed.risks);
  const risks = riskLabels.map((label, i) => ({
    id: `risk-v1-${i}`,
    label,
    level: "medium",
    levelLabelPt: "Médio",
  }));

  const hasContent = Boolean(
    mainObjective ||
      parsed.summary ||
      whatWillBeDone.length ||
      outOfScope.length ||
      completionCriteria.length,
  );

  const summary =
    parsed.summary && !isInternalOperationalLine(parsed.summary)
      ? parsed.summary
      : null;

  return {
    understanding: {
      summary,
      mainObjective,
    },
    whatWillBeDone,
    whatWillChange: [],
    outOfScope,
    executionStrategy: {
      macroOrder: whatWillBeDone.slice(0, 8),
      approach: whatWillBeDone.some((x) => /visual|componente|interface|tela/i.test(x))
        ? "Implementar componentes visuais de forma incremental, validando integração e tema."
        : null,
      dependencies: [],
    },
    complexity: (() => {
      const reason = mainObjective
        ? mainObjective.slice(0, 200)
        : "Escopo moderado com entregas coordenadas.";
      return {
        level: "medium",
        levelLabelPt: "Média",
        reason,
        explanation: reason,
      };
    })(),
    executionRecommendation: {
      recommendedLevel: "normal",
      levelLabelPt: "Normal",
      explanation: "Equilíbrio entre qualidade, contexto e custo para esta atividade.",
    },
    miniTasks: {
      mode: miniTaskRows.length > 1 ? "divided" : "direct",
      directLabelPt: "Execução direta num único passo",
      tasks: miniTaskRows,
    },
    risks,
    completionCriteria,
    hasContent,
  };
}

/**
 * Carrega o plano base (v1 ou última versão aprovada em comentários anteriores) para merge do v2.
 *
 * @param {string} outputDir
 * @param {string} [excludeCommentId]
 */
function loadBasePlanPresentation(outputDir, excludeCommentId) {
  const fromChain = findLatestUpdatedPresentation(outputDir, excludeCommentId);
  if (fromChain?.hasContent) return fromChain;

  const fromSnapshot = readPlanPresentationBaseSnapshot(outputDir);
  if (fromSnapshot?.hasContent) return fromSnapshot;

  const md = readPlanMarkdown(outputDir);
  if (!md) return null;

  const parsed = parseTaskPlanMarkdown(md);
  const clar = loadClarificationAnswerHints(outputDir);
  const built = buildPresentationFromSources(outputDir, parsed, clar);
  if (!built.hasContent) return null;
  const polished = sanitizeUpdatedPlanPresentation(built);
  if (polished?.hasContent) {
    try {
      writePlanPresentationBaseSnapshot(outputDir, polished, {
        source: "legacy-bootstrap",
      });
    } catch {
      /* snapshot opcional */
    }
  }
  return polished;
}

/**
 * Extracto para análise: preferência por apresentação estruturada, senão markdown bruto.
 *
 * @param {string} outputDir
 * @param {string} [excludeCommentId]
 */
function loadPlanExcerptForComment(outputDir, excludeCommentId) {
  const base = loadBasePlanPresentation(outputDir, excludeCommentId);
  if (base?.hasContent) {
    const excerpt = buildPlanExcerptFromPresentation(base);
    if (excerpt) return excerpt;
  }
  return readPlanMarkdown(outputDir).slice(0, 12_000);
}

module.exports = {
  loadBasePlanPresentation,
  loadPlanExcerptForComment,
  findLatestUpdatedPresentation,
  readPlanMarkdown,
  buildPresentationFromSources,
  readPlanPresentationBaseSnapshot,
  writePlanPresentationBaseSnapshot,
};
