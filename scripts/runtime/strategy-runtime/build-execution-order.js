"use strict";

const fs = require("fs");
const path = require("path");

const SUBTASKS_DIRNAME = "subtasks";

/**
 * @param {string} strategyDirAbs
 * @returns {{ id: string, title: string, dependencies: string[], dependenciesDeclared: string[] }[]}
 */
function loadSubtasksFromDisk(strategyDirAbs) {
  const subtasksDir = path.join(strategyDirAbs, SUBTASKS_DIRNAME);
  /** @type {string[]} */
  const files = [];
  for (const ent of fs.readdirSync(subtasksDir)) {
    if (/^\d{3}\.json$/i.test(ent)) files.push(ent);
  }
  files.sort((a, b) => a.localeCompare(b, undefined, { numeric: true, sensitivity: "base" }));
  /** @type {{ id: string, title: string, dependencies: string[], dependenciesDeclared: string[] }[]} */
  const out = [];
  for (const f of files) {
    const id = f.replace(/\.json$/i, "");
    const raw = fs.readFileSync(path.join(subtasksDir, f), "utf-8");
    const doc = JSON.parse(raw);
    const d = doc && typeof doc === "object" && !Array.isArray(doc) ? doc : {};
    const decl = Array.isArray(/** @type {any} */ (d).dependencies)
      ? /** @type {unknown[]} */ (/** @type {any} */ (d).dependencies).map((x) => String(x != null ? x : "").trim())
      : [];
    const deps = decl.filter((x) => /^\d{3}$/.test(x));
    out.push({
      id,
      title: String(/** @type {any} */ (d).title || ""),
      dependencies: deps,
      dependenciesDeclared: decl,
    });
  }
  return out;
}

/**
 * @param {{ id: string, title: string, dependencies: string[], dependenciesDeclared: string[] }[]} items
 * @returns {{ order: string[], dependency_warnings: string[], had_cycle: boolean }}
 */
function computeLinearOrder(items) {
  /** @type {string[]} */
  const dependency_warnings = [];
  const ids = items.map((x) => x.id).sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
  const idSet = new Set(ids);

  /** @type {Map<string, Set<string>>} */
  const children = new Map();
  for (const id of ids) children.set(id, new Set());
  /** @type {Map<string, number>} */
  const indegree = new Map();
  for (const id of ids) indegree.set(id, 0);

  for (const it of items) {
    for (const dep of it.dependenciesDeclared) {
      if (!dep) continue;
      if (!/^\d{3}$/.test(dep)) {
        dependency_warnings.push(`subtask ${it.id}: dependência com formato inválido '${dep}' ignorada.`);
      } else if (!idSet.has(dep)) {
        dependency_warnings.push(`subtask ${it.id}: dependência inexistente '${dep}' ignorada.`);
      }
    }
  }

  for (const it of items) {
    const seenValid = new Set();
    for (const dep of it.dependencies) {
      if (dep === it.id) {
        dependency_warnings.push(`subtask ${it.id}: dependência circular a si próprio ignorada.`);
        continue;
      }
      if (!idSet.has(dep)) continue;
      if (seenValid.has(dep)) continue;
      seenValid.add(dep);
      children.get(dep).add(it.id);
      indegree.set(it.id, (indegree.get(it.id) || 0) + 1);
    }
  }

  /** @type {string[]} */
  const order = [];
  /** @type {Set<string>} */
  const done = new Set();

  while (done.size < ids.length) {
    const zeros = ids.filter((id) => !done.has(id) && (indegree.get(id) || 0) === 0).sort();
    if (!zeros.length) {
      dependency_warnings.push(
        "Ciclo nas dependências entre subtasks; aplicado fallback: ordem linear estável por ID.",
      );
      return { order: [...ids], dependency_warnings, had_cycle: true };
    }
    const u = zeros[0];
    done.add(u);
    order.push(u);
    for (const v of children.get(u) || []) {
      indegree.set(v, (indegree.get(v) || 0) - 1);
    }
  }

  return { order, dependency_warnings, had_cycle: false };
}

/**
 * @param {{ id: string, title: string, dependencies: string[], dependenciesDeclared: string[] }[]} items
 * @param {Set<string>} idSet
 * @returns {string[]}
 */
function computeBlockingSubtasks(items, idSet) {
  /** @type {Set<string>} */
  const blockers = new Set();
  for (const it of items) {
    for (const dep of it.dependencies) {
      if (dep !== it.id && idSet.has(dep)) blockers.add(dep);
    }
  }
  return [...blockers].sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
}

/**
 * @param {{ strategyDir: string }} p
 * @returns {{
 *   ok: true,
 *   doc: Record<string, unknown>,
 * } | { ok: false, error: { code: string, message: string } }}
 */
function buildExecutionOrder(p) {
  const strategyDirAbs = path.resolve(String(p.strategyDir || ""));
  const subtasksDir = path.join(strategyDirAbs, SUBTASKS_DIRNAME);
  if (!fs.existsSync(subtasksDir) || !fs.statSync(subtasksDir).isDirectory()) {
    return {
      ok: false,
      error: { code: "ORDER_NO_SUBTASKS", message: "strategy/subtasks/ em falta." },
    };
  }

  let items;
  try {
    items = loadSubtasksFromDisk(strategyDirAbs);
  } catch (e) {
    const msg = e && /** @type {Error} */ (e).message ? String(/** @type {Error} */ (e).message) : String(e);
    return { ok: false, error: { code: "ORDER_READ", message: msg } };
  }

  if (!items.length) {
    return { ok: false, error: { code: "ORDER_EMPTY", message: "Nenhuma subtask encontrada." } };
  }

  const idSet = new Set(items.map((x) => x.id));
  const { order, dependency_warnings, had_cycle } = computeLinearOrder(items);
  void had_cycle;

  const byId = new Map(items.map((it) => [it.id, it]));
  /** @type {Record<string, unknown>[]} */
  const ordered_subtasks = [];
  let pos = 0;
  for (const sid of order) {
    pos += 1;
    const it = byId.get(sid);
    const declOut = it ? it.dependenciesDeclared : [];
    ordered_subtasks.push({
      position: pos,
      subtask_id: sid,
      title: it ? it.title : "",
      depends_on: [...declOut],
    });
  }

  const blocking_subtasks = computeBlockingSubtasks(items, idSet);

  const doc = {
    version: 1,
    phase: "3.5",
    status: "execution_order_completed",
    ordering_mode: "linear",
    ordered_subtasks,
    blocking_subtasks,
    dependency_warnings,
  };

  return { ok: true, doc };
}

module.exports = {
  buildExecutionOrder,
  computeLinearOrder,
  loadSubtasksFromDisk,
};
