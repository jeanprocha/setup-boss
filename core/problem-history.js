const fs = require("fs");
const path = require("path");

const SCHEMA_VERSION = "1.0.0";
const IA_DIR = ".IA";
const HISTORY_FILE = "09-problem-history.jsonl";

function nil(v, fallback = null) {
  if (v === undefined || v === "") return fallback;
  return v;
}

function compactText(value, maxLen = 800) {
  const text = String(value || "").trim();
  if (!maxLen || text.length <= maxLen) return text || null;
  return `${text.slice(0, maxLen - 1).trim()}…`;
}

function assertSafeHistoryPath(projectRoot, historyPath) {
  const root = path.resolve(projectRoot);
  const resolved = path.resolve(historyPath);
  const rel = path.relative(root, resolved);

  if (rel.startsWith("..") || path.isAbsolute(rel)) {
    throw new Error("problem-history: caminho fora do projeto.");
  }

  const normalized = rel.replace(/\\/g, "/");

  if (normalized !== `${IA_DIR}/${HISTORY_FILE}`) {
    throw new Error("problem-history: arquivo de histórico inválido.");
  }
}

function normalizeUsageTokens(usage) {
  if (!usage || typeof usage !== "object") {
    return { input_tokens: 0, output_tokens: 0, total_tokens: 0 };
  }

  const input =
    usage.input_tokens ??
    usage.prompt_tokens ??
    usage.input_token_count ??
    0;
  const output =
    usage.output_tokens ??
    usage.completion_tokens ??
    usage.output_token_count ??
    0;
  const total =
    usage.total_tokens ??
    (Number(input) + Number(output) || 0);

  return {
    input_tokens: Number(input) || 0,
    output_tokens: Number(output) || 0,
    total_tokens: Number(total) || 0,
  };
}

function readMetadataJson(outputDir) {
  if (!outputDir) return null;

  const metaPath = path.join(outputDir, "metadata.json");

  if (!fs.existsSync(metaPath)) return null;

  try {
    return JSON.parse(fs.readFileSync(metaPath, "utf-8"));
  } catch (_) {
    return null;
  }
}

function buildTaskFromSources(metadata, outputDir) {
  const taskPathRel = nil(metadata?.taskArg) || null;
  let title = null;
  let summary = null;

  const taskAbsolute = metadata?.taskPath
    ? path.resolve(metadata.taskPath)
    : outputDir
      ? path.join(outputDir, "task.md")
      : null;

  if (taskAbsolute && fs.existsSync(taskAbsolute)) {
    try {
      const content = fs.readFileSync(taskAbsolute, "utf-8");
      const titleLine = content.split("\n").find((l) => l.trim().startsWith("# "));

      title = titleLine
        ? titleLine.replace(/^#\s*/, "").trim()
        : path.basename(taskPathRel || "", ".md");

      summary =
        compactText(
          content.replace(/^#\s+[^\n]+\n?/, "").trim(),
          1200
        ) || null;
    } catch (_) {
      title = title || (taskPathRel ? path.basename(taskPathRel, ".md") : null);
    }
  } else {
    title = taskPathRel ? path.basename(taskPathRel, ".md") : null;
  }

  return {
    path: taskPathRel,
    title: title || null,
    summary: summary || null,
  };
}

/**
 * Monta um registro completo do histórico de problemas (campos obrigatórios do schema).
 */
function buildProblemEntry(opts) {
  const metadata = opts.metadata && typeof opts.metadata === "object" ? opts.metadata : {};
  const resolvedRoot = opts.projectRoot
    ? path.resolve(opts.projectRoot)
    : null;

  const projectName =
    opts.project?.name ||
    metadata.projectName ||
    (resolvedRoot ? path.basename(resolvedRoot) : null);

  const taskIn = opts.task && typeof opts.task === "object" ? opts.task : {};
  const usage = normalizeUsageTokens(opts.usage);

  const evidence = Array.isArray(opts.evidence)
    ? opts.evidence.map((e) => compactText(String(e), 2000)).filter(Boolean)
    : [];

  const files = Array.isArray(opts.files)
    ? [...new Set(opts.files.map((f) => String(f).replace(/\\/g, "/")).filter(Boolean))]
    : [];

  return {
    schema_version: SCHEMA_VERSION,
    created_at: opts.created_at || new Date().toISOString(),
    run_id: nil(opts.runId) ?? nil(metadata.runId),
    project: {
      name: projectName,
      root: resolvedRoot,
    },
    task: {
      path: nil(taskIn.path) ?? nil(metadata.taskArg),
      title: nil(taskIn.title),
      summary: nil(taskIn.summary),
    },
    step: opts.step != null ? opts.step : "unknown",
    status: opts.status != null ? opts.status : "error",
    severity: opts.severity != null ? opts.severity : "medium",
    type: opts.type != null ? opts.type : "unknown_error",
    title: opts.title != null ? String(opts.title) : "Problema",
    summary: opts.summary != null ? compactText(opts.summary, 2000) : null,
    cause: opts.cause != null ? compactText(String(opts.cause), 500) : null,
    evidence,
    files,
    llm: {
      model: nil(opts.model),
      input_tokens: usage.input_tokens,
      output_tokens: usage.output_tokens,
      total_tokens: usage.total_tokens,
    },
    resolution: {
      status: opts.resolution?.status ?? "unresolved",
      resolved_at: opts.resolution?.resolved_at ?? null,
      resolved_by_run_id: opts.resolution?.resolved_by_run_id ?? null,
      notes: opts.resolution?.notes ?? null,
    },
    environment: {
      node_env: nil(process.env.NODE_ENV),
      platform: process.platform,
    },
    extra:
      opts.extra && typeof opts.extra === "object" && !Array.isArray(opts.extra)
        ? opts.extra
        : {},
  };
}

function dedupKey(entry) {
  return `${entry.run_id || ""}|${entry.step}|${entry.type}|${entry.title}`;
}

function existingKeys(historyPath) {
  const keys = new Set();

  if (!fs.existsSync(historyPath)) return keys;

  let content;

  try {
    content = fs.readFileSync(historyPath, "utf-8");
  } catch (_) {
    return keys;
  }

  for (const line of content.split("\n")) {
    const trimmed = line.trim();

    if (!trimmed) continue;

    try {
      const row = JSON.parse(trimmed);
      keys.add(dedupKey(row));
    } catch (_) {
      continue;
    }
  }

  return keys;
}

function relativeOutputDirLabel(outputDir, projectRootResolved) {
  if (!outputDir || !projectRootResolved) return null;

  try {
    const rel = path.relative(
      path.resolve(projectRootResolved),
      path.resolve(outputDir)
    );

    if (!rel || rel.startsWith("..")) return null;

    return rel.replace(/\\/g, "/");
  } catch (_) {
    return null;
  }
}

/**
 * Anexa uma linha JSON ao arquivo `project/.IA/09-problem-history.jsonl`.
 * Falhas silenciosas exceto por console.warn (não interrompe o pipeline).
 */
function appendProblemHistoryEntry(opts = {}) {
  try {
    const fromDiskMeta = readMetadataJson(opts.outputDir);
    const metadata = {
      ...(fromDiskMeta || {}),
      ...(opts.metadata && typeof opts.metadata === "object" ? opts.metadata : {}),
    };

    const projectRootRaw = opts.projectRoot || metadata.projectRoot;

    if (!projectRootRaw) {
      console.warn("problem-history: sem projectRoot; entrada não registrada.");
      return;
    }

    const projectRoot = path.resolve(projectRootRaw);
    const iaDir = path.join(projectRoot, IA_DIR);
    const historyPath = path.join(iaDir, HISTORY_FILE);

    assertSafeHistoryPath(projectRoot, historyPath);

    const taskDefaults = buildTaskFromSources(metadata, opts.outputDir);
    const taskOverride = opts.task && typeof opts.task === "object" ? opts.task : {};

    const mergedOpts = {
      ...opts,
      metadata,
      projectRoot,
      runId: opts.runId ?? metadata.runId,
      task: {
        path: taskOverride.path ?? taskDefaults.path,
        title: taskOverride.title ?? taskDefaults.title,
        summary: taskOverride.summary ?? taskDefaults.summary,
      },
    };

    if (!mergedOpts.task.title && mergedOpts.task.path) {
      mergedOpts.task.title = path.basename(mergedOpts.task.path, ".md");
    }

    const entry = buildProblemEntry(mergedOpts);

    const outRel = relativeOutputDirLabel(opts.outputDir, path.resolve(projectRoot));

    if (
      outRel &&
      (!entry.extra || typeof entry.extra !== "object")
    ) {
      entry.extra = { ...(entry.extra || {}), output_dir_relative: outRel };
    } else if (outRel && entry.extra && typeof entry.extra === "object") {
      entry.extra = { ...entry.extra, output_dir_relative: outRel };
    }

    const keys = existingKeys(historyPath);

    if (keys.has(dedupKey(entry))) {
      return;
    }

    fs.mkdirSync(iaDir, { recursive: true });
    fs.appendFileSync(
      historyPath,
      `${JSON.stringify(entry)}\n`,
      "utf-8"
    );
  } catch (err) {
    console.warn(
      "problem-history:",
      err && err.message ? err.message : String(err)
    );
  }
}

module.exports = {
  SCHEMA_VERSION,
  buildProblemEntry,
  appendProblemHistoryEntry,
  buildTaskFromSources,
};
