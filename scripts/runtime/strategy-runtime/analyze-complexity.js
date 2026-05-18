"use strict";

const fs = require("fs");
const path = require("path");

const PLAN_REFINED = "task-plan-refined.md";

/** @type {readonly string[]} */
const RISK_TERMS = Object.freeze([
  "risco",
  "risk",
  "crítico",
  "critico",
  "critical",
  "rollback",
  "breaking",
  "segurança",
  "seguranca",
  "security",
  "governance",
  "governança",
  "governanca",
  "vulnerabil",
  "blast radius",
]);

/** @type {readonly string[]} */
const EXEC_DIFF_TERMS = Object.freeze([
  "runtime",
  "orchestration",
  "orquestra",
  "executor",
  "validation",
  "validator",
  "multi-file",
  "multifile",
  "cross-runtime",
  "cross runtime",
  "dag",
  "scheduler",
  "pipeline",
  "governance",
  "governança",
  "governanca",
]);

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
 * @param {string} text
 * @param {readonly string[]} terms
 */
function countTermHits(text, terms) {
  const lower = text.toLowerCase();
  let n = 0;
  for (const t of terms) {
    if (lower.includes(String(t).toLowerCase())) n += 1;
  }
  return n;
}

/**
 * @param {string} plan
 */
function countProbableFileRefs(plan) {
  let c = 0;
  const re = /`([^`]+)`/g;
  let m;
  while ((m = re.exec(plan)) !== null) {
    const inner = m[1];
    if (/[/\\]/.test(inner) || /\.(js|ts|tsx|jsx|mjs|cjs|json|md|yml|yaml|toml|xml|html|css|scss)$/i.test(inner)) {
      c += 1;
    }
  }
  return c;
}

/**
 * @param {string} plan
 */
function countListishLines(plan) {
  const lines = plan.split(/\r?\n/);
  let n = 0;
  for (const line of lines) {
    const t = line.trim();
    if (/^[-*]\s+/.test(t) || /^\d+\.\s+/.test(t)) n += 1;
  }
  return n;
}

/**
 * @param {string} outputDirAbs
 * @returns {{ ok: true, doc: Record<string, unknown> } | { ok: false, error: { code: string, message: string } }}
 */
function analyzeComplexity(outputDirAbs) {
  const root = path.resolve(outputDirAbs);
  const planPath = path.join(root, PLAN_REFINED);
  let plan = "";
  try {
    if (fs.existsSync(planPath)) {
      plan = fs.readFileSync(planPath, "utf-8");
    }
  } catch (e) {
    const msg = e && /** @type {Error} */ (e).message ? String(/** @type {Error} */ (e).message) : String(e);
    return {
      ok: false,
      error: { code: "COMPLEXITY_PLAN_READ", message: msg },
    };
  }

  let runContext = null;
  try {
    const rcPath = path.join(root, "run-context.json");
    if (fs.existsSync(rcPath)) {
      const raw = fs.readFileSync(rcPath, "utf-8");
      const j = JSON.parse(raw);
      if (j && typeof j === "object" && !Array.isArray(j)) runContext = j;
    }
  } catch {
    /* ignore */
  }

  const planChars = plan.length;
  const fileRefs = countProbableFileRefs(plan);
  const listLines = countListishLines(plan);
  const riskHits = countTermHits(plan, RISK_TERMS);
  let ctxSnippet = "";
  if (runContext && typeof runContext === "object") {
    const t = /** @type {Record<string, unknown>} */ (runContext).task;
    if (t && typeof t === "object" && /** @type {Record<string, unknown>} */ (t).preview != null) {
      ctxSnippet += String(/** @type {Record<string, unknown>} */ (t).preview);
    }
    const p1 = /** @type {Record<string, unknown>} */ (runContext).phase1;
    if (p1 && typeof p1 === "object") {
      ctxSnippet += " ";
      ctxSnippet += JSON.stringify(p1).slice(0, 2000);
    }
  }
  const execHits =
    countTermHits(plan, EXEC_DIFF_TERMS) + countTermHits(ctxSnippet, EXEC_DIFF_TERMS);

  /** @type {string[]} */
  const signals = [];
  /** @type {string[]} */
  const recommendations = [];

  if (planChars > 4000) signals.push("large_plan");
  else if (planChars > 1500) signals.push("medium_plan");

  if (fileRefs >= 6) signals.push("many_file_refs");
  else if (fileRefs >= 2) signals.push("multi_file_refs");

  if (riskHits >= 3) signals.push("risk_terms_dense");
  else if (riskHits >= 1) signals.push("risk_terms_present");

  if (execHits >= 2) signals.push("execution_stack_terms");
  else if (execHits >= 1) signals.push("runtime_orchestration_mentioned");

  let contextPressure = 0;
  if (planChars <= 800) contextPressure = 0;
  else if (planChars <= 2000) contextPressure = clampInt((planChars - 800) / 400, 1, 4);
  else if (planChars <= 5000) contextPressure = clampInt(4 + (planChars - 2000) / 750, 4, 7);
  else contextPressure = clampInt(7 + (planChars - 5000) / 2000, 7, 10);

  let scope = clampInt(fileRefs * 1.2 + listLines * 0.35, 0, 10);
  if (fileRefs === 0 && listLines < 4) scope = clampInt(scope, 0, 3);

  let risk = clampInt(riskHits * 2 + (riskHits >= 2 ? 2 : 0), 0, 10);

  let executionDifficulty = clampInt(execHits * 2.5 + (execHits >= 2 ? 2 : 0), 0, 10);

  const overall = clampInt(
    (scope + risk + contextPressure + executionDifficulty) / 4,
    0,
    10,
  );

  let classification = "trivial";
  if (overall >= 9) classification = "critical";
  else if (overall >= 7) classification = "complex";
  else if (overall >= 5) classification = "moderate";
  else if (overall >= 3) classification = "simple";

  if (overall >= 7) {
    recommendations.push("Considerar decomposição incremental (Fase 3.4) antes da execução.");
  }
  if (contextPressure >= 7) {
    recommendations.push("Plano extenso: reduzir contexto por sub-passos na preparação.");
  }
  if (riskHits >= 2) {
    recommendations.push("Rever riscos explícitos com owner antes de mudanças amplas.");
  }

  const doc = {
    version: 1,
    phase: "3.2",
    status: "complexity_analysis_completed",
    scores: {
      overall,
      scope,
      risk,
      context_pressure: contextPressure,
      execution_difficulty: executionDifficulty,
    },
    classification,
    signals,
    recommendations,
  };

  return { ok: true, doc };
}

module.exports = {
  analyzeComplexity,
  PLAN_REFINED,
};
