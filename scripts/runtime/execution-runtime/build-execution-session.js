"use strict";

const fs = require("fs");
const path = require("path");

const {
  EXECUTION_READY_HANDOFF_REL,
  HANDOFF_STATUS,
} = require("../strategy-runtime/build-execution-ready-handoff");

const HANDOFF_PATH = path.join("strategy", "execution-ready-handoff.json");
const EXECUTION_ORDER_PATH = path.join("strategy", "execution-order.json");

/**
 * @param {string} fp
 * @returns {object|null}
 */
function readJsonObject(fp) {
  try {
    const raw = fs.readFileSync(fp, "utf-8");
    const j = JSON.parse(raw);
    return j && typeof j === "object" && !Array.isArray(j) ? j : null;
  } catch {
    return null;
  }
}

/**
 * @param {string} rel
 */
function subtaskIdFromRel(rel) {
  const base = path.basename(String(rel || ""), ".json");
  return /^\d{3}$/.test(base) ? base : "";
}

/**
 * @param {string} rootAbs
 * @param {string[]} rels
 */
function allSubtaskFilesExist(rootAbs, rels) {
  for (const rel of rels) {
    const p = path.join(rootAbs, rel.replace(/\//g, path.sep));
    if (!fs.existsSync(p) || !fs.statSync(p).isFile()) return false;
  }
  return true;
}

/**
 * Validação mínima do handoff e execution-order para Fase 4.1 (sem strategy validate completo).
 *
 * @param {string} outputDirAbs
 * @returns {{ ok: true, handoff: Record<string, unknown>, orderDoc: Record<string, unknown>, subtaskRels: string[] } | { ok: false, error: { code: string, message: string } }}
 */
function loadHandoffAndOrderForExecution(outputDirAbs) {
  const root = path.resolve(String(outputDirAbs || ""));
  const handoffPath = path.join(root, HANDOFF_PATH);
  if (!fs.existsSync(handoffPath)) {
    return {
      ok: false,
      error: {
        code: "HANDOFF_MISSING",
        message: `${EXECUTION_READY_HANDOFF_REL} em falta.`,
      },
    };
  }

  const handoff = readJsonObject(handoffPath);
  if (!handoff) {
    return {
      ok: false,
      error: { code: "HANDOFF_INVALID_JSON", message: "execution-ready-handoff.json ilegível." },
    };
  }

  if (Number(handoff.version) !== 1) {
    return {
      ok: false,
      error: { code: "HANDOFF_VERSION", message: "execution-ready-handoff.json: version deve ser 1." },
    };
  }

  if (String(handoff.status || "") !== HANDOFF_STATUS) {
    return {
      ok: false,
      error: {
        code: "HANDOFF_STATUS",
        message: `execution-ready-handoff.json: status esperado '${HANDOFF_STATUS}'.`,
      },
    };
  }

  const subtasks = Array.isArray(handoff.subtasks) ? handoff.subtasks : [];
  const subtaskRels = subtasks.map((x) => String(x != null ? x : "").trim().replace(/\\/g, "/"));
  if (!subtaskRels.length) {
    return {
      ok: false,
      error: { code: "HANDOFF_SUBTASKS", message: "execution-ready-handoff.json: subtasks vazio." },
    };
  }

  if (!allSubtaskFilesExist(root, subtaskRels)) {
    return {
      ok: false,
      error: {
        code: "HANDOFF_SUBTASK_FILES",
        message: "execution-ready-handoff.json: ficheiro de subtask em falta no disco.",
      },
    };
  }

  const orderPath = path.join(root, EXECUTION_ORDER_PATH);
  if (!fs.existsSync(orderPath)) {
    return {
      ok: false,
      error: { code: "ORDER_MISSING", message: "strategy/execution-order.json em falta." },
    };
  }

  const orderDoc = readJsonObject(orderPath);
  if (!orderDoc) {
    return {
      ok: false,
      error: { code: "ORDER_INVALID_JSON", message: "strategy/execution-order.json ilegível." },
    };
  }

  const ordered = Array.isArray(orderDoc.ordered_subtasks) ? orderDoc.ordered_subtasks : [];
  const orderIdsRaw = ordered
    .map((row) => {
      if (!row || typeof row !== "object") return "";
      return String(/** @type {Record<string, unknown>} */ (row).subtask_id || "").trim();
    })
    .filter((id) => /^\d{3}$/.test(id));

  const orderIdSet = new Set(orderIdsRaw);
  if (orderIdSet.size !== orderIdsRaw.length) {
    return {
      ok: false,
      error: {
        code: "ORDER_DUPLICATE_IDS",
        message: "execution-order.json: subtask_id duplicado em ordered_subtasks.",
      },
    };
  }

  const handoffIds = new Set(subtaskRels.map(subtaskIdFromRel).filter(Boolean));
  if (orderIdSet.size !== handoffIds.size) {
    return {
      ok: false,
      error: {
        code: "ORDER_COUNT_MISMATCH",
        message: "execution-order.json: número de ordered_subtasks difere de handoff.subtasks.",
      },
    };
  }

  for (const id of orderIdSet) {
    if (!handoffIds.has(id)) {
      return {
        ok: false,
        error: {
          code: "ORDER_ID_MISMATCH",
          message: `execution-order.json: subtask_id '${id}' ausente no handoff.`,
        },
      };
    }
  }

  for (const id of handoffIds) {
    if (!orderIdSet.has(id)) {
      return {
        ok: false,
        error: {
          code: "ORDER_ID_MISSING",
          message: `execution-order.json: falta subtask_id '${id}' em ordered_subtasks.`,
        },
      };
    }
  }

  return { ok: true, handoff, orderDoc, subtaskRels };
}

/**
 * @param {{
 *   runId: string,
 *   subtaskCount: number,
 *   createdAt?: string,
 * }} p
 * @returns {Record<string, unknown>}
 */
function buildExecutionSessionDocument(p) {
  const createdAt = p.createdAt || new Date().toISOString();
  return {
    version: 1,
    phase: "4.1",
    status: "execution_runtime_initialized",
    execution_mode: "linear_mvp",
    created_at: createdAt,
    run_id: String(p.runId || ""),
    subtask_count: Math.max(0, Math.floor(Number(p.subtaskCount) || 0)),
    current_subtask: null,
    execution_state: "pending",
  };
}

module.exports = {
  HANDOFF_PATH,
  EXECUTION_ORDER_PATH,
  loadHandoffAndOrderForExecution,
  buildExecutionSessionDocument,
  readJsonObject,
};
