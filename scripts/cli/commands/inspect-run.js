"use strict";

const fs = require("fs");
const path = require("path");
const { resolveOutputDir } = require("../../../core/run-resolver");
const {
  RUN_OUTPUT_CRITICAL,
} = require("../../../scripts/runtime-observability/artifact-audit");
const { fallbackTraceFileAbs } = require("../../../scripts/runtime-observability/runtime-trace");

/**
 * @param {string[]} argv
 * @param {{ repoRoot?: string|null }} [_opts]
 */
function runInspectRun(argv, _opts = {}) {
  const positional = argv.filter((a) => !a.startsWith("--"));
  const rawArg = positional[0];
  const runId = rawArg != null ? String(rawArg).trim() : "";

  if (!runId) {
    console.error("Uso: npm run setup-boss -- inspect-run <runId>");
    process.exitCode = 1;
    return;
  }

  let outputDir = "";
  try {
    outputDir = resolveOutputDir(runId);
  } catch (e) {
    const msg = e && /** @type {{ message?: string }} */ (e).message ? String(e.message) : String(e);
    console.error(msg);
    process.exitCode = 1;
    return;
  }

  const traceRunPath = path.join(outputDir, "runtime-trace.jsonl");
  const fallbackTrace = fallbackTraceFileAbs();

  console.log(`runId (argumento):     ${runId}`);
  console.log(`outputDir (resolvido): ${outputDir}`);
  console.log(`runtime-trace (run):  ${traceRunPath} (${fs.existsSync(traceRunPath) ? "existe" : "ausente"})`);
  console.log(`runtime-trace (fallback daemon DATA_DIR): ${fallbackTrace}`);
  console.log("");

  console.log("— Artefactos auditáveis (run output) —");
  const missing = [];
  const present = [];
  for (const name of RUN_OUTPUT_CRITICAL) {
    const fp = path.join(outputDir, name);
    if (fs.existsSync(fp)) present.push(name);
    else missing.push(name);
  }
  console.log(`presentes (${present.length}): ${present.join(", ") || "—"}`);
  console.log(`ausentes (${missing.length}): ${missing.join(", ") || "—"}`);
  console.log("");

  /** @returns {Array<Record<string, unknown>>} */
  function parseJsonlFile(absPath) {
    let raw = "";
    try {
      raw = fs.readFileSync(absPath, "utf8");
    } catch {
      return [];
    }
    /** @type {Array<Record<string, unknown>>} */
    const out = [];
    for (const line of raw.split(/\r?\n/)) {
      const t = line.trim();
      if (!t) continue;
      try {
        out.push(/** @type {Record<string, unknown>} */ (JSON.parse(t)));
      } catch {
        /* ignorar */
      }
    }
    return out;
  }

  const fromRun = fs.existsSync(traceRunPath) ? parseJsonlFile(traceRunPath) : [];

  /** @type {Array<Record<string, unknown>>} */
  let fromFallback = [];
  if (fs.existsSync(fallbackTrace)) {
    const all = parseJsonlFile(fallbackTrace);
    const reqIds = new Set();
    for (const o of all) {
      const rid = o.runId != null ? String(o.runId) : "";
      const od = o.outputDir != null ? String(o.outputDir) : "";
      const meta =
        o.metadata != null && typeof o.metadata === "object" && !Array.isArray(o.metadata)
          ? /** @type {Record<string, unknown>} */ (o.metadata)
          : {};
      const rip = meta.runIndexPath != null ? String(meta.runIndexPath) : "";
      const matchesRun =
        rid === runId ||
        (od && path.basename(od) === runId) ||
        (rip && rip.includes(runId));
      if (matchesRun && o.requestId != null && String(o.requestId).trim()) {
        reqIds.add(String(o.requestId).trim());
      }
    }
    fromFallback = all.filter((o) => {
      const rid = o.runId != null ? String(o.runId) : "";
      const od = o.outputDir != null ? String(o.outputDir) : "";
      const rqr = o.requestId != null ? String(o.requestId).trim() : "";
      if (rid === runId) return true;
      if (od && path.basename(od) === runId) return true;
      if (rqr && reqIds.has(rqr)) return true;
      return false;
    });
    if (fromFallback.length === 0) {
      fromFallback = all.filter((o) => JSON.stringify(o).includes(runId));
    }
  }

  let lines = fromRun.concat(fromFallback);

  /** Ordenar por timestamp quando existir */
  lines.sort((a, b) => {
    const ta = String(a.timestamp || "");
    const tb = String(b.timestamp || "");
    if (ta < tb) return -1;
    if (ta > tb) return 1;
    return 0;
  });

  /** Remover duplicados exactos (mesmo merge fallback + run trace). */
  const deduped = [];
  const seen = new Set();
  for (const row of lines) {
    const key = `${row.timestamp}|${row.component}|${row.event}|${row.message}`;
    if (seen.has(key)) continue;
    seen.add(key);
    deduped.push(row);
  }

  const tail = deduped.slice(-20);
  console.log(`— Últimas ${tail.length} linhas de trace (runId=${runId}, dedupe merge fallback+run) —`);
  for (const row of tail) {
    const ts = row.timestamp != null ? String(row.timestamp) : "?";
    const ev = row.event != null ? String(row.event) : "?";
    const comp = row.component != null ? String(row.component) : "?";
    const lvl = row.level != null ? String(row.level) : "info";
    const msg = row.message != null ? String(row.message) : "";
    console.log(`  [${ts}] ${lvl} ${comp}.${ev} — ${msg}`);
  }

  /** Último erro */
  let lastErr = null;
  for (let i = deduped.length - 1; i >= 0; i--) {
    const row = deduped[i];
    if (String(row.level || "") === "error" || row.error) {
      lastErr = row;
      break;
    }
  }
  console.log("");
  if (lastErr) {
    console.log("— Último erro no trace (nível error ou campo error) —");
    console.log(JSON.stringify(lastErr, null, 2));
  } else {
    console.log("— Nenhuma entrada de erro encontrada no trace filtrado por runId —");
  }
}

module.exports = { runInspectRun };
