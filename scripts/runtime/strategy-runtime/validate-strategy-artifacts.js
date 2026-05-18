"use strict";

const fs = require("fs");
const path = require("path");

const {
  DEFAULT_CONSTRAINTS,
  SHARED_RUNTIME_CONTEXT_REL,
} = require("./build-shared-runtime-context");
const {
  EXECUTION_READY_HANDOFF_REL,
  HANDOFF_STATUS,
  HANDOFF_PHASE,
} = require("./build-execution-ready-handoff");

const STRATEGY_DIR = "strategy";
const STRATEGY_MANIFEST_FILE = "strategy-manifest.json";
const EXECUTION_STRATEGY_FILE = "execution-strategy.json";
const COMPLEXITY_ANALYSIS_FILE = "complexity-analysis.json";
const AI_STRATEGY_FILE = "ai-strategy.json";
const DECOMPOSITION_FILE = "decomposition.json";
const EXECUTION_ORDER_FILE = "execution-order.json";
const SHARED_RUNTIME_CONTEXT_FILE = "shared-runtime-context.json";
const STRATEGY_READINESS_FILE = "strategy-readiness.json";
const EXECUTION_READY_HANDOFF_FILE = "execution-ready-handoff.json";
const SUBTASKS_DIRNAME = "subtasks";

const HANDOFF_ARTIFACT_KEYS = [
  "strategy_manifest",
  "execution_strategy",
  "complexity_analysis",
  "ai_strategy",
  "decomposition",
  "execution_order",
  "shared_runtime_context",
  "strategy_readiness",
];

const CLASSIFICATIONS = new Set([
  "trivial",
  "simple",
  "moderate",
  "complex",
  "critical",
]);

const SCORE_KEYS = ["overall", "scope", "risk", "context_pressure", "execution_difficulty"];

const MODE_SET = new Set(["basic", "standard", "expert"]);
const DECOMP_STRATEGY_SET = new Set([
  "single",
  "section_based",
  "file_group_based",
  "risk_based",
  "multi_repo_workspace",
]);
const COST_SET = new Set(["low", "balanced", "high"]);
const QUALITY_SET = new Set(["economy", "balanced", "maximum"]);
const USAGE_KEYS = ["architect", "executor", "review", "correction"];

/**
 * @param {unknown} doc
 * @param {string} label
 * @returns {string[]}
 */
function validateComplexityDocument(doc, label) {
  /** @type {string[]} */
  const errors = [];
  if (!doc || typeof doc !== "object" || Array.isArray(doc)) {
    errors.push(`${label}: raiz deve ser objeto.`);
    return errors;
  }
  const d = /** @type {Record<string, unknown>} */ (doc);
  if (Number(d.version) !== 1) {
    errors.push(`${label}: version deve ser 1.`);
  }
  if (String(d.phase || "") !== "3.2") {
    errors.push(`${label}: phase deve ser '3.2'.`);
  }
  if (String(d.status || "") !== "complexity_analysis_completed") {
    errors.push(`${label}: status deve ser 'complexity_analysis_completed'.`);
  }
  const scores = d.scores;
  if (!scores || typeof scores !== "object" || Array.isArray(scores)) {
    errors.push(`${label}: scores em falta.`);
  } else {
    const s = /** @type {Record<string, unknown>} */ (scores);
    for (const k of SCORE_KEYS) {
      const v = s[k];
      if (typeof v !== "number" || !Number.isInteger(v) || v < 0 || v > 10) {
        errors.push(`${label}: scores.${k} deve ser inteiro 0..10.`);
      }
    }
  }
  const cls = String(d.classification || "");
  if (!CLASSIFICATIONS.has(cls)) {
    errors.push(`${label}: classification inválida.`);
  }
  if (!Array.isArray(d.signals)) {
    errors.push(`${label}: signals deve ser array.`);
  }
  if (!Array.isArray(d.recommendations)) {
    errors.push(`${label}: recommendations deve ser array.`);
  }
  return errors;
}

/**
 * @param {unknown} doc
 * @param {string} label
 * @returns {string[]}
 */
function validateAiStrategyDocument(doc, label) {
  /** @type {string[]} */
  const errors = [];
  if (!doc || typeof doc !== "object" || Array.isArray(doc)) {
    errors.push(`${label}: raiz deve ser objeto.`);
    return errors;
  }
  const d = /** @type {Record<string, unknown>} */ (doc);
  if (Number(d.version) !== 1) {
    errors.push(`${label}: version deve ser 1.`);
  }
  if (String(d.phase || "") !== "3.3") {
    errors.push(`${label}: phase deve ser '3.3'.`);
  }
  if (String(d.status || "") !== "ai_strategy_completed") {
    errors.push(`${label}: status deve ser 'ai_strategy_completed'.`);
  }
  const mode = String(d.recommended_mode || "");
  if (!MODE_SET.has(mode)) {
    errors.push(`${label}: recommended_mode inválido.`);
  }
  if (!Array.isArray(d.rationale)) {
    errors.push(`${label}: rationale deve ser array.`);
  }
  const cp = String(d.cost_profile || "");
  if (!COST_SET.has(cp)) {
    errors.push(`${label}: cost_profile inválido.`);
  }
  const qp = String(d.quality_profile || "");
  if (!QUALITY_SET.has(qp)) {
    errors.push(`${label}: quality_profile inválido.`);
  }
  const ru = d.recommended_usage;
  if (!ru || typeof ru !== "object" || Array.isArray(ru)) {
    errors.push(`${label}: recommended_usage em falta.`);
  } else {
    const u = /** @type {Record<string, unknown>} */ (ru);
    for (const k of USAGE_KEYS) {
      const v = String(u[k] || "");
      if (!MODE_SET.has(v)) {
        errors.push(`${label}: recommended_usage.${k} inválido.`);
      }
    }
  }
  return errors;
}

/**
 * @param {unknown} doc
 * @param {string} label
 * @returns {string[]}
 */
function validateSubtaskDocument(doc, label) {
  /** @type {string[]} */
  const errors = [];
  if (!doc || typeof doc !== "object" || Array.isArray(doc)) {
    errors.push(`${label}: raiz deve ser objeto.`);
    return errors;
  }
  const d = /** @type {Record<string, unknown>} */ (doc);
  if (Number(d.version) !== 1) {
    errors.push(`${label}: version deve ser 1.`);
  }
  const id = String(d.id || "");
  if (!/^\d{3}$/.test(id)) {
    errors.push(`${label}: id deve ser string 001..999.`);
  }
  if (!String(d.title || "").trim()) {
    errors.push(`${label}: title obrigatório.`);
  }
  if (typeof d.goal !== "string") {
    errors.push(`${label}: goal deve ser string.`);
  }
  const sc = d.scope;
  if (!sc || typeof sc !== "object" || Array.isArray(sc)) {
    errors.push(`${label}: scope em falta.`);
  } else {
    const sp = /** @type {Record<string, unknown>} */ (sc);
    if (!Array.isArray(sp.files)) {
      errors.push(`${label}: scope.files deve ser array.`);
    } else {
      for (const f of sp.files) {
        if (typeof f !== "string") errors.push(`${label}: scope.files deve conter strings.`);
      }
    }
    if (!Array.isArray(sp.domains)) {
      errors.push(`${label}: scope.domains deve ser array.`);
    } else {
      for (const dom of sp.domains) {
        if (typeof dom !== "string") errors.push(`${label}: scope.domains deve conter strings.`);
      }
    }
  }
  if (!Array.isArray(d.dependencies)) {
    errors.push(`${label}: dependencies deve ser array.`);
  } else {
    for (const dep of d.dependencies) {
      if (typeof dep !== "string" || !/^\d{3}$/.test(dep)) {
        errors.push(`${label}: dependency inválida (use ids 001..).`);
      }
    }
  }
  const cx = d.complexity;
  if (!cx || typeof cx !== "object" || Array.isArray(cx)) {
    errors.push(`${label}: complexity em falta.`);
  } else {
    const c = /** @type {Record<string, unknown>} */ (cx);
    const es = c.estimated_score;
    const rk = c.risk;
    if (typeof es !== "number" || !Number.isInteger(es) || es < 0 || es > 10) {
      errors.push(`${label}: complexity.estimated_score deve ser inteiro 0..10.`);
    }
    if (typeof rk !== "number" || !Number.isInteger(rk) || rk < 0 || rk > 10) {
      errors.push(`${label}: complexity.risk deve ser inteiro 0..10.`);
    }
  }
  const am = String(d.ai_mode || "");
  if (!MODE_SET.has(am)) {
    errors.push(`${label}: ai_mode inválido.`);
  }
  if (!Array.isArray(d.acceptance_criteria)) {
    errors.push(`${label}: acceptance_criteria deve ser array.`);
  } else if (!d.acceptance_criteria.length) {
    errors.push(`${label}: acceptance_criteria não pode ser vazio.`);
  }
  if (String(d.status || "") !== "planned") {
    errors.push(`${label}: status deve ser 'planned'.`);
  }
  const scr = d.shared_context_refs;
  if (!Array.isArray(scr)) {
    errors.push(`${label}: shared_context_refs deve ser array.`);
  } else {
    const req = "strategy/shared-runtime-context.json";
    if (!scr.includes(req)) {
      errors.push(`${label}: shared_context_refs deve incluir '${req}'.`);
    }
  }
  return errors;
}

/**
 * @param {unknown} doc
 * @param {string} label
 * @returns {string[]}
 */
function validateSharedRuntimeContextDocument(doc, label) {
  /** @type {string[]} */
  const errors = [];
  if (!doc || typeof doc !== "object" || Array.isArray(doc)) {
    errors.push(`${label}: raiz deve ser objeto.`);
    return errors;
  }
  const d = /** @type {Record<string, unknown>} */ (doc);
  if (Number(d.version) !== 1) {
    errors.push(`${label}: version deve ser 1.`);
  }
  if (String(d.phase || "") !== "3.6") {
    errors.push(`${label}: phase deve ser '3.6'.`);
  }
  if (String(d.status || "") !== "shared_runtime_context_completed") {
    errors.push(`${label}: status deve ser 'shared_runtime_context_completed'.`);
  }
  if (typeof d.global_objective !== "string") {
    errors.push(`${label}: global_objective deve ser string.`);
  }
  const cons = d.constraints;
  if (!Array.isArray(cons)) {
    errors.push(`${label}: constraints deve ser array.`);
  } else {
    for (const c of DEFAULT_CONSTRAINTS) {
      if (!cons.includes(c)) {
        errors.push(`${label}: constraints deve incluir '${c}'.`);
      }
    }
    for (const x of cons) {
      if (typeof x !== "string") errors.push(`${label}: constraints deve conter apenas strings.`);
    }
  }
  const src = d.source_artifacts;
  if (!Array.isArray(src) || !src.length) {
    errors.push(`${label}: source_artifacts deve ser array não vazio.`);
  } else {
    for (const x of src) {
      if (typeof x !== "string" || !String(x).trim()) {
        errors.push(`${label}: source_artifacts deve conter strings não vazias.`);
      }
    }
  }
  const sum = d.strategy_summary;
  if (!sum || typeof sum !== "object" || Array.isArray(sum)) {
    errors.push(`${label}: strategy_summary em falta.`);
  } else {
    const s = /** @type {Record<string, unknown>} */ (sum);
    for (const k of ["complexity", "ai_strategy", "decomposition", "execution_order"]) {
      const v = s[k];
      if (!v || typeof v !== "object" || Array.isArray(v)) {
        errors.push(`${label}: strategy_summary.${k} deve ser objeto.`);
      }
    }
  }
  const refs = d.context_refs;
  if (!Array.isArray(refs)) {
    errors.push(`${label}: context_refs deve ser array.`);
  } else {
    for (const x of refs) {
      if (typeof x !== "string") errors.push(`${label}: context_refs deve conter strings.`);
    }
  }
  return errors;
}

/**
 * @param {string} root
 * @param {Record<string, unknown>} sharedDoc
 * @returns {string[]}
 */
function validateRunContextSharedContextCoherence(root, sharedDoc) {
  /** @type {string[]} */
  const errors = [];
  const rcPath = path.join(root, "run-context.json");
  if (!fs.existsSync(rcPath)) {
    errors.push("run-context.json em falta para coerência phase3.shared_context.");
    return errors;
  }
  let rc;
  try {
    rc = JSON.parse(fs.readFileSync(rcPath, "utf-8"));
  } catch (e) {
    const msg = e && /** @type {Error} */ (e).message ? String(/** @type {Error} */ (e).message) : String(e);
    errors.push(`run-context.json ilegível (${msg}).`);
    return errors;
  }
  const p3 = rc && typeof rc === "object" ? /** @type {Record<string, unknown>} */ (rc).phase3 : null;
  if (!p3 || typeof p3 !== "object") {
    errors.push("run-context.phase3 em falta.");
    return errors;
  }
  const sh = /** @type {Record<string, unknown>} */ (p3).shared_context;
  if (!sh || typeof sh !== "object") {
    errors.push("run-context.phase3.shared_context em falta.");
    return errors;
  }
  if (String(sh.status || "") !== "shared_runtime_context_completed") {
    errors.push("run-context.phase3.shared_context.status incoerente.");
  }
  if (String(sh.artifact || "") !== "strategy/shared-runtime-context.json") {
    errors.push("run-context.phase3.shared_context.artifact incoerente.");
  }
  if (String(sharedDoc.status || "") !== String(sh.status || "")) {
    errors.push("run-context.phase3.shared_context.status difere de shared-runtime-context.json.");
  }
  return errors;
}

/**
 * @param {unknown} doc
 * @param {string} label
 * @returns {string[]}
 */
function validateStrategyReadinessDocument(doc, label) {
  /** @type {string[]} */
  const errors = [];
  if (!doc || typeof doc !== "object" || Array.isArray(doc)) {
    errors.push(`${label}: raiz deve ser objeto.`);
    return errors;
  }
  const d = /** @type {Record<string, unknown>} */ (doc);
  if (Number(d.version) !== 1) {
    errors.push(`${label}: version deve ser 1.`);
  }
  if (String(d.phase || "") !== "3.7") {
    errors.push(`${label}: phase deve ser '3.7'.`);
  }
  if (String(d.status || "") !== "strategy_ready") {
    errors.push(`${label}: status deve ser 'strategy_ready'.`);
  }
  const val = d.validation;
  if (!val || typeof val !== "object" || Array.isArray(val)) {
    errors.push(`${label}: validation em falta.`);
  } else {
    const v = /** @type {Record<string, unknown>} */ (val);
    if (typeof v.valid !== "boolean") {
      errors.push(`${label}: validation.valid deve ser boolean.`);
    }
    if (!Array.isArray(v.errors)) {
      errors.push(`${label}: validation.errors deve ser array.`);
    } else {
      for (const e of v.errors) {
        if (typeof e !== "string") errors.push(`${label}: validation.errors deve conter strings.`);
      }
    }
    if (!Array.isArray(v.warnings)) {
      errors.push(`${label}: validation.warnings deve ser array.`);
    } else {
      for (const w of v.warnings) {
        if (typeof w !== "string") errors.push(`${label}: validation.warnings deve conter strings.`);
      }
    }
    if (v.valid !== true) {
      errors.push(`${label}: validation.valid deve ser true para Fase 3.7 concluída.`);
    }
  }
  const sum = d.summary;
  if (!sum || typeof sum !== "object" || Array.isArray(sum)) {
    errors.push(`${label}: summary em falta.`);
  } else {
    const s = /** @type {Record<string, unknown>} */ (sum);
    if (typeof s.complexity !== "string") {
      errors.push(`${label}: summary.complexity deve ser string.`);
    }
    if (typeof s.ai_mode !== "string") {
      errors.push(`${label}: summary.ai_mode deve ser string.`);
    }
    if (typeof s.subtask_count !== "number" || !Number.isInteger(s.subtask_count) || s.subtask_count < 0) {
      errors.push(`${label}: summary.subtask_count inválido.`);
    }
    if (String(s.ordering_mode || "") !== "linear") {
      errors.push(`${label}: summary.ordering_mode deve ser 'linear'.`);
    }
  }
  if (!Array.isArray(d.artifacts)) {
    errors.push(`${label}: artifacts deve ser array.`);
  } else {
    for (const a of d.artifacts) {
      if (typeof a !== "string") errors.push(`${label}: artifacts deve conter strings.`);
    }
  }
  if (!d.generated_at || String(d.generated_at).trim() === "") {
    errors.push(`${label}: generated_at obrigatório.`);
  }
  return errors;
}

/**
 * @param {Record<string, unknown>} readinessDoc
 * @param {number} subtaskFileCount
 * @param {Record<string, unknown>} complexityDoc
 * @param {Record<string, unknown>} aiDoc
 * @param {Record<string, unknown>} executionOrderDoc
 * @returns {string[]}
 */
function validateReadinessSummaryCoherence(
  readinessDoc,
  subtaskFileCount,
  complexityDoc,
  aiDoc,
  executionOrderDoc,
) {
  /** @type {string[]} */
  const errors = [];
  const sum = readinessDoc.summary;
  if (!sum || typeof sum !== "object" || Array.isArray(sum)) return errors;
  const s = /** @type {Record<string, unknown>} */ (sum);
  if (Number(s.subtask_count) !== subtaskFileCount) {
    errors.push("strategy-readiness.json: summary.subtask_count incoerente com ficheiros em strategy/subtasks/.");
  }
  if (String(s.complexity || "") !== String(complexityDoc.classification || "")) {
    errors.push("strategy-readiness.json: summary.complexity incoerente com complexity-analysis.json.");
  }
  if (String(s.ai_mode || "") !== String(aiDoc.recommended_mode || "")) {
    errors.push("strategy-readiness.json: summary.ai_mode incoerente com ai-strategy.json.");
  }
  if (String(s.ordering_mode || "") !== String(executionOrderDoc.ordering_mode || "")) {
    errors.push("strategy-readiness.json: summary.ordering_mode incoerente com execution-order.json.");
  }
  return errors;
}

/**
 * @param {string} root
 * @param {Record<string, unknown>} readinessDoc
 * @returns {string[]}
 */
function validateRunContextReadinessCoherence(root, readinessDoc) {
  /** @type {string[]} */
  const errors = [];
  const rcPath = path.join(root, "run-context.json");
  if (!fs.existsSync(rcPath)) {
    errors.push("run-context.json em falta para coerência phase3.readiness.");
    return errors;
  }
  let rc;
  try {
    rc = JSON.parse(fs.readFileSync(rcPath, "utf-8"));
  } catch (e) {
    const msg = e && /** @type {Error} */ (e).message ? String(/** @type {Error} */ (e).message) : String(e);
    errors.push(`run-context.json ilegível (${msg}).`);
    return errors;
  }
  const p3 = rc && typeof rc === "object" ? /** @type {Record<string, unknown>} */ (rc).phase3 : null;
  if (!p3 || typeof p3 !== "object") {
    errors.push("run-context.phase3 em falta.");
    return errors;
  }
  const rd = /** @type {Record<string, unknown>} */ (p3).readiness;
  if (!rd || typeof rd !== "object") {
    errors.push("run-context.phase3.readiness em falta.");
    return errors;
  }
  if (String(rd.status || "") !== "strategy_ready") {
    errors.push("run-context.phase3.readiness.status incoerente.");
  }
  if (String(rd.artifact || "") !== "strategy/strategy-readiness.json") {
    errors.push("run-context.phase3.readiness.artifact incoerente.");
  }
  if (String(readinessDoc.status || "") !== String(rd.status || "")) {
    errors.push("run-context.phase3.readiness.status difere de strategy-readiness.json.");
  }
  return errors;
}

/**
 * @param {unknown} doc
 * @param {string} label
 * @returns {string[]}
 */
function validateExecutionReadyHandoffDocument(doc, label) {
  /** @type {string[]} */
  const errors = [];
  if (!doc || typeof doc !== "object" || Array.isArray(doc)) {
    errors.push(`${label}: raiz deve ser objeto.`);
    return errors;
  }
  const d = /** @type {Record<string, unknown>} */ (doc);
  if (Number(d.version) !== 1) {
    errors.push(`${label}: version deve ser 1.`);
  }
  if (String(d.phase || "") !== HANDOFF_PHASE) {
    errors.push(`${label}: phase deve ser '${HANDOFF_PHASE}'.`);
  }
  if (String(d.status || "") !== HANDOFF_STATUS) {
    errors.push(`${label}: status deve ser '${HANDOFF_STATUS}'.`);
  }
  if (String(d.execution_mode || "") !== "strategy_only") {
    errors.push(`${label}: execution_mode deve ser 'strategy_only'.`);
  }
  const sum = d.summary;
  if (!sum || typeof sum !== "object" || Array.isArray(sum)) {
    errors.push(`${label}: summary em falta.`);
  } else {
    const s = /** @type {Record<string, unknown>} */ (sum);
    if (typeof s.complexity !== "string" || !String(s.complexity).trim()) {
      errors.push(`${label}: summary.complexity deve ser string não vazia.`);
    }
    if (typeof s.ai_mode !== "string" || !String(s.ai_mode).trim()) {
      errors.push(`${label}: summary.ai_mode deve ser string não vazia.`);
    }
    if (typeof s.subtask_count !== "number" || !Number.isInteger(s.subtask_count) || s.subtask_count < 0) {
      errors.push(`${label}: summary.subtask_count inválido.`);
    }
    if (String(s.ordering_mode || "") !== "linear") {
      errors.push(`${label}: summary.ordering_mode deve ser 'linear'.`);
    }
  }
  const arts = d.artifacts;
  if (!arts || typeof arts !== "object" || Array.isArray(arts)) {
    errors.push(`${label}: artifacts em falta.`);
  } else {
    const a = /** @type {Record<string, unknown>} */ (arts);
    for (const k of HANDOFF_ARTIFACT_KEYS) {
      if (!(k in a)) {
        errors.push(`${label}: artifacts.${k} em falta.`);
        continue;
      }
      const v = a[k];
      if (typeof v !== "string" || !String(v).trim()) {
        errors.push(`${label}: artifacts.${k} deve ser path string.`);
      }
    }
  }
  if (!Array.isArray(d.subtasks)) {
    errors.push(`${label}: subtasks deve ser array.`);
  } else {
    for (const st of d.subtasks) {
      if (typeof st !== "string" || !/^strategy\/subtasks\/\d{3}\.json$/i.test(st)) {
        errors.push(`${label}: subtasks deve conter paths strategy/subtasks/NNN.json.`);
      }
    }
  }
  if (String(d.shared_context_ref || "") !== SHARED_RUNTIME_CONTEXT_REL) {
    errors.push(`${label}: shared_context_ref deve ser '${SHARED_RUNTIME_CONTEXT_REL}'.`);
  }
  if (String(d.next_phase || "") !== "phase4_execution_runtime") {
    errors.push(`${label}: next_phase deve ser 'phase4_execution_runtime'.`);
  }
  if (!d.generated_at || String(d.generated_at).trim() === "") {
    errors.push(`${label}: generated_at obrigatório.`);
  }
  return errors;
}

/**
 * @param {string} root
 * @param {Record<string, unknown>} handoffDoc
 * @returns {string[]}
 */
function validateHandoffArtifactPathsExist(root, handoffDoc) {
  /** @type {string[]} */
  const errors = [];
  const arts = handoffDoc.artifacts;
  if (!arts || typeof arts !== "object" || Array.isArray(arts)) return errors;
  const a = /** @type {Record<string, unknown>} */ (arts);
  for (const k of HANDOFF_ARTIFACT_KEYS) {
    const rel = String(a[k] || "");
    if (!rel.trim()) continue;
    const fp = path.join(root, rel);
    if (!fs.existsSync(fp)) {
      errors.push(`execution-ready-handoff.json: artifacts.${k} path em falta (${rel}).`);
    }
  }
  return errors;
}

/**
 * @param {Record<string, unknown>} handoffDoc
 * @param {number} subtaskFileCount
 * @param {Record<string, unknown>} complexityDoc
 * @param {Record<string, unknown>} aiDoc
 * @param {Record<string, unknown>} executionOrderDoc
 * @returns {string[]}
 */
function validateHandoffSummaryCoherence(
  handoffDoc,
  subtaskFileCount,
  complexityDoc,
  aiDoc,
  executionOrderDoc,
) {
  /** @type {string[]} */
  const errors = [];
  const sum = handoffDoc.summary;
  if (!sum || typeof sum !== "object" || Array.isArray(sum)) return errors;
  const s = /** @type {Record<string, unknown>} */ (sum);
  if (Number(s.subtask_count) !== subtaskFileCount) {
    errors.push("execution-ready-handoff.json: summary.subtask_count incoerente com ficheiros em strategy/subtasks/.");
  }
  if (String(s.complexity || "") !== String(complexityDoc.classification || "")) {
    errors.push("execution-ready-handoff.json: summary.complexity incoerente com complexity-analysis.json.");
  }
  if (String(s.ai_mode || "") !== String(aiDoc.recommended_mode || "")) {
    errors.push("execution-ready-handoff.json: summary.ai_mode incoerente com ai-strategy.json.");
  }
  if (String(s.ordering_mode || "") !== String(executionOrderDoc.ordering_mode || "")) {
    errors.push("execution-ready-handoff.json: summary.ordering_mode incoerente com execution-order.json.");
  }
  return errors;
}

/**
 * @param {string} root
 * @param {Record<string, unknown>} handoffDoc
 * @param {string[]} subtaskRelPathsSorted
 * @returns {string[]}
 */
function validateHandoffSubtasksVsDisk(root, handoffDoc, subtaskRelPathsSorted) {
  /** @type {string[]} */
  const errors = [];
  const listed = Array.isArray(handoffDoc.subtasks) ? /** @type {string[]} */ (handoffDoc.subtasks) : [];
  if (listed.length !== subtaskRelPathsSorted.length) {
    errors.push("execution-ready-handoff.json: subtasks.length difere do disco.");
  }
  const sorted = [...listed].sort((a, b) => a.localeCompare(b, undefined, { numeric: true, sensitivity: "base" }));
  for (let i = 0; i < subtaskRelPathsSorted.length; i++) {
    if (sorted[i] !== subtaskRelPathsSorted[i]) {
      errors.push("execution-ready-handoff.json: subtasks não coincide com strategy/subtasks/ no disco.");
      break;
    }
  }
  for (const rel of listed) {
    if (typeof rel !== "string" || !fs.existsSync(path.join(root, rel))) {
      errors.push(`execution-ready-handoff.json: subtask em falta (${String(rel)}).`);
    }
  }
  return errors;
}

/**
 * @param {string} root
 * @param {Record<string, unknown>} handoffDoc
 * @returns {string[]}
 */
function validateRunContextHandoffCoherence(root, handoffDoc) {
  /** @type {string[]} */
  const errors = [];
  const rcPath = path.join(root, "run-context.json");
  if (!fs.existsSync(rcPath)) {
    errors.push("run-context.json em falta para coerência phase3.handoff.");
    return errors;
  }
  let rc;
  try {
    rc = JSON.parse(fs.readFileSync(rcPath, "utf-8"));
  } catch (e) {
    const msg = e && /** @type {Error} */ (e).message ? String(/** @type {Error} */ (e).message) : String(e);
    errors.push(`run-context.json ilegível (${msg}).`);
    return errors;
  }
  const p3 = rc && typeof rc === "object" ? /** @type {Record<string, unknown>} */ (rc).phase3 : null;
  if (!p3 || typeof p3 !== "object") {
    errors.push("run-context.phase3 em falta.");
    return errors;
  }
  const hf = /** @type {Record<string, unknown>} */ (p3).handoff;
  if (!hf || typeof hf !== "object") {
    errors.push("run-context.phase3.handoff em falta.");
    return errors;
  }
  if (String(hf.status || "") !== HANDOFF_STATUS) {
    errors.push("run-context.phase3.handoff.status incoerente.");
  }
  if (String(hf.artifact || "") !== EXECUTION_READY_HANDOFF_REL) {
    errors.push("run-context.phase3.handoff.artifact incoerente.");
  }
  if (String(handoffDoc.status || "") !== String(hf.status || "")) {
    errors.push("run-context.phase3.handoff.status difere de execution-ready-handoff.json.");
  }
  return errors;
}

/**
 * @param {unknown} doc
 * @param {string} label
 * @returns {string[]}
 */
function validateDecompositionDocument(doc, label) {
  /** @type {string[]} */
  const errors = [];
  if (!doc || typeof doc !== "object" || Array.isArray(doc)) {
    errors.push(`${label}: raiz deve ser objeto.`);
    return errors;
  }
  const d = /** @type {Record<string, unknown>} */ (doc);
  if (Number(d.version) !== 1) {
    errors.push(`${label}: version deve ser 1.`);
  }
  if (String(d.phase || "") !== "3.4") {
    errors.push(`${label}: phase deve ser '3.4'.`);
  }
  if (String(d.status || "") !== "decomposition_completed") {
    errors.push(`${label}: status deve ser 'decomposition_completed'.`);
  }
  const st = String(d.strategy || "");
  if (!DECOMP_STRATEGY_SET.has(st)) {
    errors.push(`${label}: strategy inválida.`);
  }
  const cnt = d.subtask_count;
  if (typeof cnt !== "number" || !Number.isInteger(cnt) || cnt < 0) {
    errors.push(`${label}: subtask_count inválido.`);
  }
  if (!Array.isArray(d.rationale)) {
    errors.push(`${label}: rationale deve ser array.`);
  }
  if (!Array.isArray(d.subtasks)) {
    errors.push(`${label}: subtasks deve ser array.`);
  } else {
    for (const stx of d.subtasks) {
      if (!stx || typeof stx !== "object" || Array.isArray(stx)) {
        errors.push(`${label}: subtasks entries devem ser objetos.`);
        continue;
      }
      const sx = /** @type {Record<string, unknown>} */ (stx);
      if (!/^\d{3}$/.test(String(sx.id || ""))) {
        errors.push(`${label}: subtasks[].id inválido.`);
      }
      if (!String(sx.title || "").trim()) {
        errors.push(`${label}: subtasks[].title obrigatório.`);
      }
    }
  }
  return errors;
}

/**
 * @param {unknown} doc
 * @param {string} label
 * @returns {string[]}
 */
function validateExecutionOrderDocument(doc, label) {
  /** @type {string[]} */
  const errors = [];
  if (!doc || typeof doc !== "object" || Array.isArray(doc)) {
    errors.push(`${label}: raiz deve ser objeto.`);
    return errors;
  }
  const d = /** @type {Record<string, unknown>} */ (doc);
  if (Number(d.version) !== 1) {
    errors.push(`${label}: version deve ser 1.`);
  }
  if (String(d.phase || "") !== "3.5") {
    errors.push(`${label}: phase deve ser '3.5'.`);
  }
  if (String(d.status || "") !== "execution_order_completed") {
    errors.push(`${label}: status deve ser 'execution_order_completed'.`);
  }
  if (String(d.ordering_mode || "") !== "linear") {
    errors.push(`${label}: ordering_mode deve ser 'linear'.`);
  }
  if (!Array.isArray(d.ordered_subtasks)) {
    errors.push(`${label}: ordered_subtasks deve ser array.`);
  }
  if (!Array.isArray(d.blocking_subtasks)) {
    errors.push(`${label}: blocking_subtasks deve ser array.`);
  } else {
    for (const b of d.blocking_subtasks) {
      if (typeof b !== "string" || !/^\d{3}$/.test(b)) {
        errors.push(`${label}: blocking_subtasks deve conter ids 001..`);
      }
    }
  }
  if (!Array.isArray(d.dependency_warnings)) {
    errors.push(`${label}: dependency_warnings deve ser array.`);
  } else {
    for (const w of d.dependency_warnings) {
      if (typeof w !== "string") errors.push(`${label}: dependency_warnings deve conter strings.`);
    }
  }
  return errors;
}

/**
 * @param {string} root
 * @param {Record<string, unknown>} eoDoc
 * @returns {string[]}
 */
function validateRunContextExecutionOrderCoherence(root, eoDoc) {
  /** @type {string[]} */
  const errors = [];
  const rcPath = path.join(root, "run-context.json");
  if (!fs.existsSync(rcPath)) {
    errors.push("run-context.json em falta para coerência phase3.execution_order.");
    return errors;
  }
  let rc;
  try {
    rc = JSON.parse(fs.readFileSync(rcPath, "utf-8"));
  } catch (e) {
    const msg = e && /** @type {Error} */ (e).message ? String(/** @type {Error} */ (e).message) : String(e);
    errors.push(`run-context.json ilegível (${msg}).`);
    return errors;
  }
  const p3 = rc && typeof rc === "object" ? /** @type {Record<string, unknown>} */ (rc).phase3 : null;
  if (!p3 || typeof p3 !== "object") {
    errors.push("run-context.phase3 em falta.");
    return errors;
  }
  const ex = /** @type {Record<string, unknown>} */ (p3).execution_order;
  if (!ex || typeof ex !== "object") {
    errors.push("run-context.phase3.execution_order em falta.");
    return errors;
  }
  if (String(ex.status || "") !== "execution_order_completed") {
    errors.push("run-context.phase3.execution_order.status incoerente.");
  }
  if (String(ex.ordering_mode || "") !== String(eoDoc.ordering_mode || "")) {
    errors.push("run-context.phase3.execution_order.ordering_mode difere de execution-order.json.");
  }
  const cnt = Number(eoDoc.ordered_subtasks && Array.isArray(eoDoc.ordered_subtasks) ? eoDoc.ordered_subtasks.length : -1);
  if (Number(ex.subtask_count) !== cnt) {
    errors.push("run-context.phase3.execution_order.subtask_count difere de execution-order.json.");
  }
  return errors;
}

/**
 * @param {string} root
 * @param {Record<string, unknown>} decDoc
 * @returns {string[]}
 */
function validateRunContextDecompositionCoherence(root, decDoc) {
  /** @type {string[]} */
  const errors = [];
  const rcPath = path.join(root, "run-context.json");
  if (!fs.existsSync(rcPath)) {
    errors.push("run-context.json em falta para coerência phase3.decomposition.");
    return errors;
  }
  let rc;
  try {
    rc = JSON.parse(fs.readFileSync(rcPath, "utf-8"));
  } catch (e) {
    const msg = e && /** @type {Error} */ (e).message ? String(/** @type {Error} */ (e).message) : String(e);
    errors.push(`run-context.json ilegível (${msg}).`);
    return errors;
  }
  const p3 = rc && typeof rc === "object" ? /** @type {Record<string, unknown>} */ (rc).phase3 : null;
  if (!p3 || typeof p3 !== "object") {
    errors.push("run-context.phase3 em falta.");
    return errors;
  }
  const dx = /** @type {Record<string, unknown>} */ (p3).decomposition;
  if (!dx || typeof dx !== "object") {
    errors.push("run-context.phase3.decomposition em falta.");
    return errors;
  }
  if (String(dx.status || "") !== "decomposition_completed") {
    errors.push("run-context.phase3.decomposition.status incoerente.");
  }
  const cnt = Number(decDoc.subtask_count);
  if (Number(dx.subtask_count) !== cnt) {
    errors.push("run-context.phase3.decomposition.subtask_count difere de decomposition.json.");
  }
  return errors;
}

/**
 * @param {string} root
 * @param {Record<string, unknown>} complexityDoc
 * @returns {string[]}
 */
function validateRunContextComplexityCoherence(root, complexityDoc) {
  /** @type {string[]} */
  const errors = [];
  const rcPath = path.join(root, "run-context.json");
  if (!fs.existsSync(rcPath)) {
    errors.push("run-context.json em falta para coerência phase3.complexity.");
    return errors;
  }
  let rc;
  try {
    rc = JSON.parse(fs.readFileSync(rcPath, "utf-8"));
  } catch (e) {
    const msg = e && /** @type {Error} */ (e).message ? String(/** @type {Error} */ (e).message) : String(e);
    errors.push(`run-context.json ilegível (${msg}).`);
    return errors;
  }
  const p3 = rc && typeof rc === "object" ? /** @type {Record<string, unknown>} */ (rc).phase3 : null;
  if (!p3 || typeof p3 !== "object") {
    errors.push("run-context.phase3 em falta.");
    return errors;
  }
  const cx = /** @type {Record<string, unknown>} */ (p3).complexity;
  if (!cx || typeof cx !== "object") {
    errors.push("run-context.phase3.complexity em falta.");
    return errors;
  }
  if (String(cx.status || "") !== "complexity_analysis_completed") {
    errors.push("run-context.phase3.complexity.status incoerente.");
  }
  const scores = /** @type {Record<string, unknown>} */ (complexityDoc).scores;
  const overall =
    scores && typeof scores === "object" && !Array.isArray(scores)
      ? /** @type {Record<string, unknown>} */ (scores).overall
      : null;
  if (Number(cx.overall) !== Number(overall)) {
    errors.push("run-context.phase3.complexity.overall difere de complexity-analysis.json.");
  }
  if (String(cx.classification || "") !== String(complexityDoc.classification || "")) {
    errors.push("run-context.phase3.complexity.classification incoerente com complexity-analysis.json.");
  }
  return errors;
}

/**
 * @param {string} root
 * @param {Record<string, unknown>} aiDoc
 * @returns {string[]}
 */
function validateRunContextAiStrategyCoherence(root, aiDoc) {
  /** @type {string[]} */
  const errors = [];
  const rcPath = path.join(root, "run-context.json");
  if (!fs.existsSync(rcPath)) {
    errors.push("run-context.json em falta para coerência phase3.ai_strategy.");
    return errors;
  }
  let rc;
  try {
    rc = JSON.parse(fs.readFileSync(rcPath, "utf-8"));
  } catch (e) {
    const msg = e && /** @type {Error} */ (e).message ? String(/** @type {Error} */ (e).message) : String(e);
    errors.push(`run-context.json ilegível (${msg}).`);
    return errors;
  }
  const p3 = rc && typeof rc === "object" ? /** @type {Record<string, unknown>} */ (rc).phase3 : null;
  if (!p3 || typeof p3 !== "object") {
    errors.push("run-context.phase3 em falta.");
    return errors;
  }
  const ax = /** @type {Record<string, unknown>} */ (p3).ai_strategy;
  if (!ax || typeof ax !== "object") {
    errors.push("run-context.phase3.ai_strategy em falta.");
    return errors;
  }
  if (String(ax.status || "") !== "ai_strategy_completed") {
    errors.push("run-context.phase3.ai_strategy.status incoerente.");
  }
  if (String(ax.recommended_mode || "") !== String(aiDoc.recommended_mode || "")) {
    errors.push("run-context.phase3.ai_strategy.recommended_mode difere de ai-strategy.json.");
  }
  return errors;
}

/**
 * @param {string} outputDirAbs
 * @param {{ phase37?: boolean, phase38?: boolean }} [options]
 * @returns {{ ok: true } | { ok: false, errors: string[] }}
 */
function validateStrategyArtifacts(outputDirAbs, options) {
  const phase37 = !(options && options.phase37 === false);
  const phase38 = phase37 && !(options && options.phase38 === false);
  /** @type {string[]} */
  const errors = [];
  const root = path.resolve(outputDirAbs);
  const strategyDir = path.join(root, STRATEGY_DIR);

  if (!fs.existsSync(strategyDir) || !fs.statSync(strategyDir).isDirectory()) {
    errors.push(`Pasta ${STRATEGY_DIR}/ em falta ou inválida.`);
    return { ok: false, errors };
  }

  const manifestPath = path.join(strategyDir, STRATEGY_MANIFEST_FILE);
  const execPath = path.join(strategyDir, EXECUTION_STRATEGY_FILE);
  const complexityPath = path.join(strategyDir, COMPLEXITY_ANALYSIS_FILE);
  const aiPath = path.join(strategyDir, AI_STRATEGY_FILE);
  const decompositionPath = path.join(strategyDir, DECOMPOSITION_FILE);
  const executionOrderPath = path.join(strategyDir, EXECUTION_ORDER_FILE);
  const sharedRuntimePath = path.join(strategyDir, SHARED_RUNTIME_CONTEXT_FILE);
  const readinessPath = path.join(strategyDir, STRATEGY_READINESS_FILE);
  const handoffPath = path.join(strategyDir, EXECUTION_READY_HANDOFF_FILE);
  const subtasksDir = path.join(strategyDir, SUBTASKS_DIRNAME);

  if (!fs.existsSync(manifestPath)) {
    errors.push(`${STRATEGY_DIR}/${STRATEGY_MANIFEST_FILE} em falta.`);
  }
  if (!fs.existsSync(execPath)) {
    errors.push(`${STRATEGY_DIR}/${EXECUTION_STRATEGY_FILE} em falta.`);
  }
  if (!fs.existsSync(complexityPath)) {
    errors.push(`${STRATEGY_DIR}/${COMPLEXITY_ANALYSIS_FILE} em falta.`);
  }
  if (!fs.existsSync(aiPath)) {
    errors.push(`${STRATEGY_DIR}/${AI_STRATEGY_FILE} em falta.`);
  }
  if (!fs.existsSync(decompositionPath)) {
    errors.push(`${STRATEGY_DIR}/${DECOMPOSITION_FILE} em falta.`);
  }
  if (!fs.existsSync(executionOrderPath)) {
    errors.push(`${STRATEGY_DIR}/${EXECUTION_ORDER_FILE} em falta.`);
  }
  if (!fs.existsSync(sharedRuntimePath)) {
    errors.push(`${STRATEGY_DIR}/${SHARED_RUNTIME_CONTEXT_FILE} em falta.`);
  }
  if (phase37 && !fs.existsSync(readinessPath)) {
    errors.push(`${STRATEGY_DIR}/${STRATEGY_READINESS_FILE} em falta.`);
  }
  if (phase38 && !fs.existsSync(handoffPath)) {
    errors.push(`${STRATEGY_DIR}/${EXECUTION_READY_HANDOFF_FILE} em falta.`);
  }
  if (!fs.existsSync(subtasksDir) || !fs.statSync(subtasksDir).isDirectory()) {
    errors.push(`${STRATEGY_DIR}/${SUBTASKS_DIRNAME}/ em falta ou inválida.`);
  }
  if (errors.length) return { ok: false, errors };

  /** @type {unknown} */
  let manifest;
  /** @type {unknown} */
  let execDoc;
  /** @type {unknown} */
  let complexityDoc;
  /** @type {unknown} */
  let aiDoc;
  /** @type {unknown} */
  let decompositionDoc;
  /** @type {unknown} */
  let executionOrderDoc;
  /** @type {unknown} */
  let sharedRuntimeDoc;
  /** @type {unknown} */
  let readinessDoc = null;
  /** @type {unknown} */
  let handoffDoc = null;
  try {
    manifest = JSON.parse(fs.readFileSync(manifestPath, "utf-8"));
  } catch (e) {
    const msg = e && /** @type {Error} */ (e).message ? String(/** @type {Error} */ (e).message) : String(e);
    errors.push(`${STRATEGY_MANIFEST_FILE}: JSON inválido (${msg}).`);
    return { ok: false, errors };
  }
  try {
    execDoc = JSON.parse(fs.readFileSync(execPath, "utf-8"));
  } catch (e) {
    const msg = e && /** @type {Error} */ (e).message ? String(/** @type {Error} */ (e).message) : String(e);
    errors.push(`${EXECUTION_STRATEGY_FILE}: JSON inválido (${msg}).`);
    return { ok: false, errors };
  }
  try {
    complexityDoc = JSON.parse(fs.readFileSync(complexityPath, "utf-8"));
  } catch (e) {
    const msg = e && /** @type {Error} */ (e).message ? String(/** @type {Error} */ (e).message) : String(e);
    errors.push(`${COMPLEXITY_ANALYSIS_FILE}: JSON inválido (${msg}).`);
    return { ok: false, errors };
  }
  try {
    aiDoc = JSON.parse(fs.readFileSync(aiPath, "utf-8"));
  } catch (e) {
    const msg = e && /** @type {Error} */ (e).message ? String(/** @type {Error} */ (e).message) : String(e);
    errors.push(`${AI_STRATEGY_FILE}: JSON inválido (${msg}).`);
    return { ok: false, errors };
  }
  try {
    decompositionDoc = JSON.parse(fs.readFileSync(decompositionPath, "utf-8"));
  } catch (e) {
    const msg = e && /** @type {Error} */ (e).message ? String(/** @type {Error} */ (e).message) : String(e);
    errors.push(`${DECOMPOSITION_FILE}: JSON inválido (${msg}).`);
    return { ok: false, errors };
  }
  try {
    executionOrderDoc = JSON.parse(fs.readFileSync(executionOrderPath, "utf-8"));
  } catch (e) {
    const msg = e && /** @type {Error} */ (e).message ? String(/** @type {Error} */ (e).message) : String(e);
    errors.push(`${EXECUTION_ORDER_FILE}: JSON inválido (${msg}).`);
    return { ok: false, errors };
  }
  try {
    sharedRuntimeDoc = JSON.parse(fs.readFileSync(sharedRuntimePath, "utf-8"));
  } catch (e) {
    const msg = e && /** @type {Error} */ (e).message ? String(/** @type {Error} */ (e).message) : String(e);
    errors.push(`${SHARED_RUNTIME_CONTEXT_FILE}: JSON inválido (${msg}).`);
    return { ok: false, errors };
  }
  if (phase37) {
    try {
      readinessDoc = JSON.parse(fs.readFileSync(readinessPath, "utf-8"));
    } catch (e) {
      const msg = e && /** @type {Error} */ (e).message ? String(/** @type {Error} */ (e).message) : String(e);
      errors.push(`${STRATEGY_READINESS_FILE}: JSON inválido (${msg}).`);
      return { ok: false, errors };
    }
  }
  if (phase38) {
    try {
      handoffDoc = JSON.parse(fs.readFileSync(handoffPath, "utf-8"));
    } catch (e) {
      const msg = e && /** @type {Error} */ (e).message ? String(/** @type {Error} */ (e).message) : String(e);
      errors.push(`${EXECUTION_READY_HANDOFF_FILE}: JSON inválido (${msg}).`);
      return { ok: false, errors };
    }
  }

  /** @type {string[]} */
  const subtaskFiles = [];
  try {
    for (const ent of fs.readdirSync(subtasksDir)) {
      if (/^\d{3}\.json$/i.test(ent)) subtaskFiles.push(ent);
    }
  } catch (e) {
    const msg = e && /** @type {Error} */ (e).message ? String(/** @type {Error} */ (e).message) : String(e);
    errors.push(`strategy/subtasks: leitura falhou (${msg}).`);
    return { ok: false, errors };
  }
  subtaskFiles.sort((a, b) => a.localeCompare(b, undefined, { numeric: true, sensitivity: "base" }));
  for (let i = 0; i < subtaskFiles.length; i++) {
    const expected = `${String(i + 1).padStart(3, "0")}.json`;
    if (subtaskFiles[i].toLowerCase() !== expected.toLowerCase()) {
      errors.push(`strategy/subtasks: sequência inválida (esperado ${expected}, tem ${subtaskFiles[i]}).`);
    }
  }
  const subtaskRelPathsSorted = subtaskFiles.map((f) => `strategy/subtasks/${f}`);

  if (!manifest || typeof manifest !== "object" || Array.isArray(manifest)) {
    errors.push("strategy-manifest: raiz deve ser objeto.");
  } else {
    const m = /** @type {Record<string, unknown>} */ (manifest);
    if (Number(m.version) !== 1) {
      errors.push("strategy-manifest: version deve ser 1.");
    }
    if (phase37) {
      if (phase38) {
        if (String(m.phase || "") !== HANDOFF_PHASE) {
          errors.push(`strategy-manifest: phase deve ser '${HANDOFF_PHASE}'.`);
        }
        if (String(m.status || "") !== HANDOFF_STATUS) {
          errors.push(`strategy-manifest: status deve ser '${HANDOFF_STATUS}'.`);
        }
      } else {
        if (String(m.phase || "") !== "3.7") {
          errors.push("strategy-manifest: phase deve ser '3.7'.");
        }
        if (String(m.status || "") !== "strategy_ready") {
          errors.push("strategy-manifest: status deve ser 'strategy_ready'.");
        }
      }
    } else {
      if (String(m.phase || "") !== "3.6") {
        errors.push("strategy-manifest: phase deve ser '3.6'.");
      }
      if (String(m.status || "") !== "shared_runtime_context_completed") {
        errors.push("strategy-manifest: status deve ser 'shared_runtime_context_completed'.");
      }
    }
    if (!m.created_at || String(m.created_at).trim() === "") {
      errors.push("strategy-manifest: created_at obrigatório.");
    }
    if (!m.run_id || String(m.run_id).trim() === "") {
      errors.push("strategy-manifest: run_id obrigatório.");
    }
    const arts = m.strategy_artifacts;
    if (!Array.isArray(arts)) {
      errors.push("strategy-manifest: strategy_artifacts deve ser array.");
    } else {
      const required = [
        "strategy/execution-strategy.json",
        "strategy/complexity-analysis.json",
        "strategy/ai-strategy.json",
        "strategy/decomposition.json",
        "strategy/execution-order.json",
        "strategy/shared-runtime-context.json",
      ];
      if (phase37) required.push("strategy/strategy-readiness.json");
      if (phase38) required.push(EXECUTION_READY_HANDOFF_REL);
      for (const req of required) {
        if (!arts.includes(req)) {
          errors.push(`strategy-manifest: strategy_artifacts deve incluir '${req}'.`);
        }
      }
      for (const rp of subtaskRelPathsSorted) {
        if (!arts.includes(rp)) {
          errors.push(`strategy-manifest: strategy_artifacts deve incluir '${rp}'.`);
        }
      }
    }
  }

  if (!execDoc || typeof execDoc !== "object" || Array.isArray(execDoc)) {
    errors.push("execution-strategy: raiz deve ser objeto.");
  } else {
    const e = /** @type {Record<string, unknown>} */ (execDoc);
    if (Number(e.version) !== 1) {
      errors.push("execution-strategy: version deve ser 1.");
    }
    if (String(e.strategy_status || "") !== "initialized") {
      errors.push("execution-strategy: strategy_status deve ser 'initialized'.");
    }
    if (String(e.execution_mode || "") !== "preparation_only") {
      errors.push("execution-strategy: execution_mode deve ser 'preparation_only'.");
    }
    if (e.decomposition_ready !== true) {
      errors.push("execution-strategy: decomposition_ready deve ser true (Fase 3.4).");
    }
    if (e.ordering_ready !== true) {
      errors.push("execution-strategy: ordering_ready deve ser true (Fase 3.5).");
    }
    if (e.complexity_analysis_ready !== true) {
      errors.push("execution-strategy: complexity_analysis_ready deve ser true (Fase 3.2).");
    }
    if (e.ai_strategy_ready !== true) {
      errors.push("execution-strategy: ai_strategy_ready deve ser true (Fase 3.3).");
    }
    if (e.shared_context_ready !== true) {
      errors.push("execution-strategy: shared_context_ready deve ser true (Fase 3.6).");
    }
    if (phase37) {
      if (e.strategy_ready !== true) {
        errors.push("execution-strategy: strategy_ready deve ser true (Fase 3.7).");
      }
      if (phase38) {
        if (e.handoff_ready !== true) {
          errors.push("execution-strategy: handoff_ready deve ser true (Fase 3.8).");
        }
      } else if (e.handoff_ready === true) {
        errors.push("execution-strategy: handoff_ready não deve ser true antes da Fase 3.8.");
      }
    } else if (e.strategy_ready === true) {
      errors.push("execution-strategy: strategy_ready não deve ser true antes da Fase 3.7.");
    }
  }

  errors.push(
    ...validateComplexityDocument(complexityDoc, COMPLEXITY_ANALYSIS_FILE),
  );
  errors.push(...validateAiStrategyDocument(aiDoc, AI_STRATEGY_FILE));
  errors.push(...validateDecompositionDocument(decompositionDoc, DECOMPOSITION_FILE));
  errors.push(...validateExecutionOrderDocument(executionOrderDoc, EXECUTION_ORDER_FILE));
  errors.push(
    ...validateSharedRuntimeContextDocument(sharedRuntimeDoc, SHARED_RUNTIME_CONTEXT_FILE),
  );
  if (phase37 && readinessDoc) {
    errors.push(...validateStrategyReadinessDocument(readinessDoc, STRATEGY_READINESS_FILE));
  }
  if (phase38 && handoffDoc) {
    errors.push(...validateExecutionReadyHandoffDocument(handoffDoc, EXECUTION_READY_HANDOFF_FILE));
  }

  const subtaskIdsFromFiles = subtaskFiles.map((f) => f.replace(/\.json$/i, ""));
  const idSetFromFiles = new Set(subtaskIdsFromFiles);

  const eoRec =
    executionOrderDoc && typeof executionOrderDoc === "object" && !Array.isArray(executionOrderDoc)
      ? /** @type {Record<string, unknown>} */ (executionOrderDoc)
      : null;
  const ordered = eoRec && Array.isArray(eoRec.ordered_subtasks) ? eoRec.ordered_subtasks : null;
  if (ordered) {
    if (ordered.length !== subtaskIdsFromFiles.length) {
      errors.push("execution-order.json: ordered_subtasks.length deve igualar número de subtasks.");
    }
    /** @type {Set<string>} */
    const seen = new Set();
    for (let i = 0; i < ordered.length; i++) {
      const row = ordered[i];
      if (!row || typeof row !== "object" || Array.isArray(row)) {
        errors.push(`execution-order.json: ordered_subtasks[${i}] inválido.`);
        continue;
      }
      const r = /** @type {Record<string, unknown>} */ (row);
      const pos = r.position;
      const sid = String(r.subtask_id || "");
      if (typeof pos !== "number" || !Number.isInteger(pos) || pos !== i + 1) {
        errors.push(`execution-order.json: position sequencial inválida em índice ${i}.`);
      }
      if (!/^\d{3}$/.test(sid)) {
        errors.push(`execution-order.json: subtask_id inválido em índice ${i}.`);
      }
      if (!idSetFromFiles.has(sid)) {
        errors.push(`execution-order.json: subtask_id '${sid}' sem ficheiro em strategy/subtasks/.`);
      }
      if (seen.has(sid)) {
        errors.push(`execution-order.json: subtask_id '${sid}' duplicado.`);
      }
      seen.add(sid);
      if (typeof r.title !== "string") {
        errors.push(`execution-order.json: title deve ser string em ${sid}.`);
      }
      if (!Array.isArray(r.depends_on)) {
        errors.push(`execution-order.json: depends_on deve ser array em ${sid}.`);
      } else {
        for (const d of r.depends_on) {
          if (typeof d !== "string") errors.push(`execution-order.json: depends_on deve conter strings (${sid}).`);
        }
      }
    }
    if (seen.size !== idSetFromFiles.size || [...idSetFromFiles].some((id) => !seen.has(id))) {
      errors.push("execution-order.json: ordered_subtasks deve listar exactamente todas as subtasks.");
    }
  }
  if (eoRec && Array.isArray(eoRec.blocking_subtasks)) {
    for (const b of eoRec.blocking_subtasks) {
      if (typeof b === "string" && !idSetFromFiles.has(b)) {
        errors.push(`execution-order.json: blocking_subtasks contém id desconhecido '${b}'.`);
      }
    }
  }

  const decRec =
    decompositionDoc && typeof decompositionDoc === "object" && !Array.isArray(decompositionDoc)
      ? /** @type {Record<string, unknown>} */ (decompositionDoc)
      : null;
  const decCount = decRec ? Number(decRec.subtask_count) : -1;
  if (decRec && Number.isInteger(decCount)) {
    if (decCount !== subtaskRelPathsSorted.length) {
      errors.push("decomposition.json: subtask_count não confere com ficheiros em strategy/subtasks/.");
    }
    const subs = decRec.subtasks;
    if (Array.isArray(subs) && subs.length !== decCount) {
      errors.push("decomposition.json: subtasks.length deve igualar subtask_count.");
    }
    if (Array.isArray(subs)) {
      for (let i = 0; i < subs.length; i++) {
        const expectedId = `${String(i + 1).padStart(3, "0")}`;
        const s = subs[i];
        if (!s || typeof s !== "object" || Array.isArray(s)) continue;
        if (String(/** @type {Record<string, unknown>} */ (s).id || "") !== expectedId) {
          errors.push(`decomposition.json: subtasks[${i}].id deve ser '${expectedId}'.`);
        }
      }
    }
  }

  for (const fn of subtaskFiles) {
    const fp = path.join(subtasksDir, fn);
    let stDoc;
    try {
      stDoc = JSON.parse(fs.readFileSync(fp, "utf-8"));
    } catch (e) {
      const msg = e && /** @type {Error} */ (e).message ? String(/** @type {Error} */ (e).message) : String(e);
      errors.push(`${fn}: JSON inválido (${msg}).`);
      continue;
    }
    errors.push(...validateSubtaskDocument(stDoc, `strategy/subtasks/${fn}`));
    if (stDoc && typeof stDoc === "object" && !Array.isArray(stDoc)) {
      const idFromFile = fn.replace(/\.json$/i, "");
      if (String(/** @type {Record<string, unknown>} */ (stDoc).id || "") !== idFromFile) {
        errors.push(`strategy/subtasks/${fn}: id deve coincidir com o nome do ficheiro.`);
      }
    }
  }

  if (
    errors.length === 0 &&
    complexityDoc &&
    typeof complexityDoc === "object" &&
    !Array.isArray(complexityDoc)
  ) {
    errors.push(
      ...validateRunContextComplexityCoherence(
        root,
        /** @type {Record<string, unknown>} */ (complexityDoc),
      ),
    );
  }
  if (errors.length === 0 && aiDoc && typeof aiDoc === "object" && !Array.isArray(aiDoc)) {
    errors.push(
      ...validateRunContextAiStrategyCoherence(
        root,
        /** @type {Record<string, unknown>} */ (aiDoc),
      ),
    );
  }
  if (errors.length === 0 && decRec) {
    errors.push(...validateRunContextDecompositionCoherence(root, decRec));
  }
  if (errors.length === 0 && eoRec) {
    errors.push(...validateRunContextExecutionOrderCoherence(root, eoRec));
  }
  const sharedRec =
    sharedRuntimeDoc && typeof sharedRuntimeDoc === "object" && !Array.isArray(sharedRuntimeDoc)
      ? /** @type {Record<string, unknown>} */ (sharedRuntimeDoc)
      : null;
  if (errors.length === 0 && sharedRec) {
    errors.push(...validateRunContextSharedContextCoherence(root, sharedRec));
  }
  const readinessRec =
    phase37 && readinessDoc && typeof readinessDoc === "object" && !Array.isArray(readinessDoc)
      ? /** @type {Record<string, unknown>} */ (readinessDoc)
      : null;
  if (
    errors.length === 0 &&
    readinessRec &&
    complexityDoc &&
    typeof complexityDoc === "object" &&
    !Array.isArray(complexityDoc) &&
    aiDoc &&
    typeof aiDoc === "object" &&
    !Array.isArray(aiDoc) &&
    executionOrderDoc &&
    typeof executionOrderDoc === "object" &&
    !Array.isArray(executionOrderDoc)
  ) {
    errors.push(
      ...validateReadinessSummaryCoherence(
        readinessRec,
        subtaskFiles.length,
        /** @type {Record<string, unknown>} */ (complexityDoc),
        /** @type {Record<string, unknown>} */ (aiDoc),
        /** @type {Record<string, unknown>} */ (executionOrderDoc),
      ),
    );
  }
  if (errors.length === 0 && readinessRec) {
    errors.push(...validateRunContextReadinessCoherence(root, readinessRec));
  }

  const handoffRec =
    phase38 && handoffDoc && typeof handoffDoc === "object" && !Array.isArray(handoffDoc)
      ? /** @type {Record<string, unknown>} */ (handoffDoc)
      : null;
  if (errors.length === 0 && handoffRec) {
    errors.push(...validateHandoffArtifactPathsExist(root, handoffRec));
  }
  if (
    errors.length === 0 &&
    handoffRec &&
    complexityDoc &&
    typeof complexityDoc === "object" &&
    !Array.isArray(complexityDoc) &&
    aiDoc &&
    typeof aiDoc === "object" &&
    !Array.isArray(aiDoc) &&
    executionOrderDoc &&
    typeof executionOrderDoc === "object" &&
    !Array.isArray(executionOrderDoc)
  ) {
    errors.push(
      ...validateHandoffSummaryCoherence(
        handoffRec,
        subtaskFiles.length,
        /** @type {Record<string, unknown>} */ (complexityDoc),
        /** @type {Record<string, unknown>} */ (aiDoc),
        /** @type {Record<string, unknown>} */ (executionOrderDoc),
      ),
    );
  }
  if (errors.length === 0 && handoffRec) {
    errors.push(...validateHandoffSubtasksVsDisk(root, handoffRec, subtaskRelPathsSorted));
  }
  if (errors.length === 0 && handoffRec) {
    errors.push(...validateRunContextHandoffCoherence(root, handoffRec));
  }

  if (errors.length) return { ok: false, errors };
  return { ok: true };
}

module.exports = {
  validateStrategyArtifacts,
  validateComplexityDocument,
  validateAiStrategyDocument,
  validateDecompositionDocument,
  validateExecutionOrderDocument,
  validateSharedRuntimeContextDocument,
  validateStrategyReadinessDocument,
  validateExecutionReadyHandoffDocument,
  validateSubtaskDocument,
  STRATEGY_DIR,
  STRATEGY_MANIFEST_FILE,
  EXECUTION_STRATEGY_FILE,
  COMPLEXITY_ANALYSIS_FILE,
  AI_STRATEGY_FILE,
  DECOMPOSITION_FILE,
  EXECUTION_ORDER_FILE,
  SHARED_RUNTIME_CONTEXT_FILE,
  STRATEGY_READINESS_FILE,
  EXECUTION_READY_HANDOFF_FILE,
};
