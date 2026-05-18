"use strict";

const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const { resolveOutputDir } = require("../../../core/run-resolver");

const MAX_ARTIFACTS = 200;
const MAX_WALK_DEPTH = 8;
const MAX_READ_BYTES = 512 * 1024;
const MAX_CONTENT_CHARS = 56_000;
const TEXT_EXT = new Set([
  ".json",
  ".md",
  ".markdown",
  ".txt",
  ".log",
  ".ndjson",
]);

/** @typedef {{ id: string, runId: string, name: string, relativePath: string, mime: string, sizeBytes: number, modifiedAt: string|null, phase: string|null, source: string, status: string, category: string|null }} ArtifactSummaryDto */

/** @typedef {{ id: string, runId: string, severity: string, code: string, message: string, phase: string|null, source: string, status: string, relatedArtifactId: string|null, ts: string|null }} DiagnosticDto */

/** @typedef {{ runId: string, state: string, validatedAt: string|null, validationSource: string|null, continuity: string|null, crossValidation: string|null, summary: string|null, warningsCount: number, inconsistenciesCount: number }} IntegritySummaryDto */

/** @typedef {{ ts: string|null, level: string, message: string }} ConsoleLineDto */

function isSafeRelativePath(rel) {
  if (!rel || typeof rel !== "string") return false;
  const n = rel.replace(/\\/g, "/").trim();
  if (!n || n.startsWith("/") || /^[a-zA-Z]:/.test(n)) return false;
  if (n.includes("..")) return false;
  const parts = n.split("/");
  return parts.every((p) => p.length > 0 && p !== "." && p !== "..");
}

function normalizeRel(rel) {
  return rel.replace(/\\/g, "/").replace(/^\/+/, "");
}

function artifactIdForRelativePath(relativePath) {
  const norm = normalizeRel(relativePath);
  const h = crypto.createHash("sha256").update(norm).digest("base64url").slice(0, 20);
  return `art-${h}`;
}

function mimeFromName(name) {
  const n = String(name).toLowerCase();
  if (n.endsWith(".json")) return "application/json";
  if (n.endsWith(".md") || n.endsWith(".markdown")) return "text/markdown";
  if (n.endsWith(".txt") || n.endsWith(".log")) return "text/plain";
  if (n.endsWith(".ndjson")) return "application/x-ndjson";
  return "application/octet-stream";
}

function isTextArtifact(name) {
  const ext = path.extname(String(name)).toLowerCase();
  return TEXT_EXT.has(ext);
}

function inferCategory(relativePath, name) {
  const s = `${relativePath}/${name}`.toLowerCase();
  if (s.includes("integrity") || s.includes("validation")) return "integrity";
  if (s.includes("diagnostic")) return "diagnostics";
  if (s.includes("observability") || s.includes("telemetry")) return "observability";
  if (s.includes("rollback")) return "rollback";
  if (s.includes("correction")) return "correction";
  if (s.includes("review")) return "review";
  if (s.includes("execution")) return "execution";
  if (s.includes("strategy")) return "strategy";
  return "runtime";
}

function inferPhase(relativePath) {
  const seg = normalizeRel(relativePath).split("/")[0];
  if (!seg) return null;
  const known = [
    "intake",
    "strategy",
    "execution",
    "review",
    "correction",
    "rollback",
    "runtime",
  ];
  return known.includes(seg.toLowerCase()) ? seg.toLowerCase() : null;
}

/**
 * @param {string} outputDir
 * @param {string} rel
 * @param {number} depth
 * @param {string[]} acc
 */
function walkArtifacts(outputDir, rel, depth, acc) {
  if (acc.length >= MAX_ARTIFACTS || depth > MAX_WALK_DEPTH) return;

  const abs = rel ? path.join(outputDir, rel) : outputDir;
  let entries;

  try {
    entries = fs.readdirSync(abs, { withFileTypes: true });
  } catch (_) {
    return;
  }

  for (const ent of entries) {
    if (ent.name.startsWith(".")) continue;
    const childRel = rel ? `${rel}/${ent.name}` : ent.name;
    const norm = normalizeRel(childRel);
    if (!isSafeRelativePath(norm)) continue;

    const childAbs = path.join(outputDir, norm);
    let st;

    try {
      st = fs.statSync(childAbs);
    } catch (_) {
      continue;
    }

    if (st.isDirectory()) {
      walkArtifacts(outputDir, norm, depth + 1, acc);
    } else if (st.isFile()) {
      acc.push(norm);
      if (acc.length >= MAX_ARTIFACTS) return;
    }
  }
}

/**
 * @param {string} outputDir
 * @param {string} relativePath
 * @param {string} runId
 * @returns {ArtifactSummaryDto}
 */
function buildArtifactSummary(outputDir, relativePath, runId) {
  const abs = path.join(outputDir, relativePath);
  const st = fs.statSync(abs);
  const name = path.basename(relativePath);
  let modifiedAt = null;
  try {
    modifiedAt =
      st.mtime instanceof Date && !Number.isNaN(st.mtime.getTime())
        ? st.mtime.toISOString()
        : null;
  } catch (_) {
    modifiedAt = null;
  }

  return {
    id: artifactIdForRelativePath(relativePath),
    runId,
    name,
    relativePath: normalizeRel(relativePath),
    mime: mimeFromName(name),
    sizeBytes: st.size,
    modifiedAt,
    phase: inferPhase(relativePath),
    source: "runtime",
    status: "ready",
    category: inferCategory(relativePath, name),
  };
}

/**
 * @param {string} outputDir
 * @param {string} relativePath
 */
function readArtifactContent(outputDir, relativePath) {
  const norm = normalizeRel(relativePath);
  if (!isSafeRelativePath(norm)) {
    return {
      ok: false,
      error: { code: "invalid_path", message: "Caminho relativo inválido." },
    };
  }

  const abs = path.join(outputDir, norm);
  const resolved = path.resolve(abs);
  const root = path.resolve(outputDir);

  if (resolved !== root && !resolved.startsWith(root + path.sep)) {
    return {
      ok: false,
      error: { code: "path_escape", message: "Path fora do output dir." },
    };
  }

  if (!fs.existsSync(resolved) || !fs.statSync(resolved).isFile()) {
    return {
      ok: false,
      error: { code: "not_found", message: "Artifact não encontrado." },
    };
  }

  const name = path.basename(norm);
  if (!isTextArtifact(name)) {
    return {
      ok: true,
      data: {
        relativePath: norm,
        mime: mimeFromName(name),
        content: null,
        truncated: false,
        unsupported: true,
        sizeBytes: fs.statSync(resolved).size,
      },
    };
  }

  const sizeBytes = fs.statSync(resolved).size;
  const readLen = Math.min(sizeBytes, MAX_READ_BYTES);
  const buf = Buffer.alloc(readLen);
  const fd = fs.openSync(resolved, "r");

  try {
    fs.readSync(fd, buf, 0, readLen, 0);
  } finally {
    fs.closeSync(fd);
  }

  let text = buf.toString("utf8");
  let truncated = sizeBytes > MAX_READ_BYTES;

  if (text.length > MAX_CONTENT_CHARS) {
    text = text.slice(0, MAX_CONTENT_CHARS);
    truncated = true;
  }

  return {
    ok: true,
    data: {
      relativePath: norm,
      mime: mimeFromName(name),
      content: text,
      truncated,
      unsupported: false,
      sizeBytes,
    },
  };
}

/**
 * @param {unknown} v
 * @returns {string}
 */
function diagSeverityFrom(v) {
  const s = String(v || "info").toLowerCase();
  if (s === "error" || s === "err" || s === "fatal") return "error";
  if (s === "warn" || s === "warning") return "warn";
  if (s === "integrity") return "integrity";
  return "info";
}

/**
 * @param {string} outputDir
 * @param {string} runId
 * @param {Map<string, string>} relToArtifactId
 * @returns {DiagnosticDto[]}
 */
function collectDiagnostics(outputDir, runId, relToArtifactId) {
  /** @type {DiagnosticDto[]} */
  const out = [];
  let n = 0;
  const maxDiag = 120;

  for (const rel of relToArtifactId.keys()) {
    if (n >= maxDiag) break;
    if (!/diagnostic/i.test(rel) || !rel.endsWith(".json")) continue;

    const abs = path.join(outputDir, rel);
    let raw;

    try {
      const st = fs.statSync(abs);
      if (st.size > MAX_READ_BYTES) continue;
      raw = JSON.parse(fs.readFileSync(abs, "utf8"));
    } catch (_) {
      continue;
    }

    const phase = inferPhase(rel);
    const events = Array.isArray(raw?.events)
      ? raw.events
      : Array.isArray(raw?.diagnostic_events)
        ? raw.diagnostic_events
        : Array.isArray(raw?.warnings)
          ? raw.warnings
          : [];

    for (const ev of events) {
      if (n >= maxDiag) break;
      if (!ev || typeof ev !== "object") continue;
      const rec = /** @type {Record<string, unknown>} */ (ev);
      const msg =
        rec.message != null
          ? String(rec.message)
          : rec.msg != null
            ? String(rec.msg)
            : rec.detail != null
              ? String(rec.detail)
              : JSON.stringify(rec).slice(0, 240);
      const code =
        rec.code != null
          ? String(rec.code)
          : rec.type != null
            ? String(rec.type)
            : rec.event != null
              ? String(rec.event)
              : "DIAG";

      let relatedArtifactId = null;
      const artRef =
        rec.artifact != null
          ? String(rec.artifact)
          : rec.artifact_ref != null
            ? String(rec.artifact_ref)
            : rec.related_artifact != null
              ? String(rec.related_artifact)
              : null;

      if (artRef) {
        const key = normalizeRel(artRef.replace(/^\.\//, ""));
        relatedArtifactId = relToArtifactId.get(key) ?? null;
      }

      out.push({
        id: `diag-${runId}-${n}`,
        runId,
        severity: diagSeverityFrom(rec.severity ?? rec.level),
        code: code.slice(0, 64),
        message: msg.slice(0, 500),
        phase,
        source: "runtime",
        status: "ready",
        relatedArtifactId,
        ts:
          rec.timestamp != null
            ? String(rec.timestamp)
            : rec.ts != null
              ? String(rec.ts)
              : null,
      });
      n += 1;
    }
  }

  return out;
}

/**
 * @param {string} outputDir
 * @param {string} runId
 * @returns {IntegritySummaryDto|null}
 */
function collectIntegrity(outputDir, runId) {
  let entries;

  try {
    entries = fs.readdirSync(outputDir, { withFileTypes: true, recursive: true });
  } catch (_) {
    return null;
  }

  /** @type {string[]} */
  const candidates = [];

  for (const ent of entries) {
    if (!ent.isFile()) continue;
    const name = ent.name.toLowerCase();
    if (!name.includes("integrity") || !name.endsWith(".json")) continue;
    const parent = ent.parentPath || ent.path || outputDir;
    const rel = path.relative(outputDir, path.join(parent, ent.name)).replace(/\\/g, "/");
    if (isSafeRelativePath(rel)) candidates.push(rel);
  }

  if (!candidates.length) {
    try {
      const flat = fs.readdirSync(outputDir);
      for (const n of flat) {
        if (/integrity/i.test(n) && n.endsWith(".json")) candidates.push(n);
      }
    } catch (_) {
      return null;
    }
  }

  const rel = candidates.sort((a, b) => a.length - b.length)[0];
  if (!rel) return null;

  let raw;

  try {
    const abs = path.join(outputDir, rel);
    const st = fs.statSync(abs);
    if (st.size > MAX_READ_BYTES) return null;
    raw = JSON.parse(fs.readFileSync(abs, "utf8"));
  } catch (_) {
    return null;
  }

  const ok = raw?.ok === true || raw?.state === "ok";
  const degraded = raw?.state === "degraded" || raw?.degraded === true;
  const state = ok ? "ok" : degraded ? "degraded" : raw?.ok === false ? "failed" : "degraded";

  return {
    runId,
    state,
    validatedAt:
      raw?.validatedAt != null
        ? String(raw.validatedAt)
        : raw?.validated_at != null
          ? String(raw.validated_at)
          : null,
    validationSource:
      raw?.source != null
        ? String(raw.source)
        : raw?.validation_source != null
          ? String(raw.validation_source)
          : "runtime",
    continuity:
      raw?.continuity != null ? String(raw.continuity) : null,
    crossValidation:
      raw?.crossValidation != null
        ? String(raw.crossValidation)
        : raw?.cross_validation != null
          ? String(raw.cross_validation)
          : null,
    summary:
      raw?.summary != null
        ? String(raw.summary)
        : raw?.message != null
          ? String(raw.message)
          : null,
    warningsCount: Number(raw?.warnings ?? raw?.warningsCount ?? 0) || 0,
    inconsistenciesCount:
      Number(raw?.inconsistencies ?? raw?.inconsistenciesCount ?? 0) || 0,
  };
}

/**
 * @param {object|null} job
 * @param {string} runId
 * @returns {ConsoleLineDto[]}
 */
function collectConsoleLines(job, runId) {
  /** @type {ConsoleLineDto[]} */
  const lines = [];

  if (job && Array.isArray(job.events)) {
    for (const ev of job.events.slice(-80)) {
      if (!ev || typeof ev !== "object") continue;
      const rec = /** @type {Record<string, unknown>} */ (ev);
      const type = rec.type != null ? String(rec.type) : "event";
      const msg =
        rec.message != null
          ? String(rec.message)
          : rec.data && typeof rec.data === "object"
            ? JSON.stringify(rec.data).slice(0, 280)
            : type;
      lines.push({
        ts: rec.timestamp != null ? String(rec.timestamp) : null,
        level: type.includes("fail") || type.includes("error") ? "error" : "info",
        message: `[${type}] ${msg}`.slice(0, 400),
      });
    }
  }

  if (!lines.length) {
    lines.push({
      ts: null,
      level: "info",
      message: `[runtime] Run ${runId} — sem eventos de fila; consola reservada para logs do worker.`,
    });
  }

  return lines.slice(-100);
}

/**
 * Resolve run id a partir de runId ou job id na fila.
 * @param {string} idOrRunId
 * @param {import('./queue-store').Job[]|object[]} jobs
 */
function resolveRunIdForEvidence(idOrRunId, jobs) {
  const arg = String(idOrRunId || "").trim();
  if (!arg) return { runId: null, job: null, error: "empty" };

  try {
    resolveOutputDir(arg, { warnLegacy: false });
    return { runId: arg, job: null, error: null };
  } catch (_) {
    /* tentar job */
  }

  const job = jobs.find((j) => j && String(j.id) === arg);
  if (job && job.runId) {
    return { runId: String(job.runId), job, error: null };
  }

  if (job && !job.runId) {
    return { runId: null, job, error: "no_run_id" };
  }

  return { runId: null, job: null, error: "not_found" };
}

/**
 * @param {string} runId
 * @param {object|null} [job]
 */
function collectRunEvidence(runId, job = null) {
  let outputDir;

  try {
    outputDir = resolveOutputDir(runId, { warnLegacy: false });
  } catch (e) {
    return {
      ok: false,
      error: {
        code: "output_unavailable",
        message: String(e?.message || e),
      },
    };
  }

  /** @type {string[]} */
  const relPaths = [];
  walkArtifacts(outputDir, "", 0, relPaths);

  const artifacts = relPaths.map((rel) =>
    buildArtifactSummary(outputDir, rel, runId),
  );

  const relToArtifactId = new Map(
    artifacts.map((a) => [a.relativePath, a.id]),
  );

  const diagnostics = collectDiagnostics(outputDir, runId, relToArtifactId);
  const integrity = collectIntegrity(outputDir, runId);
  const consoleLines = collectConsoleLines(job, runId);

  return {
    ok: true,
    data: {
      runId,
      artifacts,
      diagnostics,
      integrity,
      consoleLines,
      truncatedListing: relPaths.length >= MAX_ARTIFACTS,
    },
  };
}

/**
 * @param {string} runId
 * @param {string} artifactId
 * @param {ArtifactSummaryDto[]} artifacts
 */
function findArtifactById(runId, artifactId, artifacts) {
  return artifacts.find((a) => a.id === artifactId && a.runId === runId) ?? null;
}

module.exports = {
  MAX_ARTIFACTS,
  MAX_READ_BYTES,
  MAX_CONTENT_CHARS,
  isSafeRelativePath,
  normalizeRel,
  artifactIdForRelativePath,
  collectRunEvidence,
  readArtifactContent,
  resolveRunIdForEvidence,
  findArtifactById,
};
