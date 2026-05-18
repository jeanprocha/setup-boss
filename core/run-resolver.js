const fs = require("fs");
const path = require("path");

const {
  isInsideProjectIaOutputs,
} = require("../scripts/shared/ia-path-resolver");

const ROOT_DIR = path.resolve(__dirname, "..");
const RUNS_DIR = path.join(ROOT_DIR, ".setup-boss", "runs");
const LEGACY_OUTPUTS_DIR = path.join(ROOT_DIR, "outputs");

function slugify(text) {
  return String(text || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "")
    .slice(0, 60);
}

/**
 * Padrão oficial: YYYYMMDD-HHmmss-<task-slug>
 */
function getRunId(taskArg) {
  const now = new Date();
  const pad = (n) => String(n).padStart(2, "0");
  const yyyy = now.getFullYear();
  const MM = pad(now.getMonth() + 1);
  const dd = pad(now.getDate());
  const HH = pad(now.getHours());
  const mm = pad(now.getMinutes());
  const ss = pad(now.getSeconds());
  const stamp = `${yyyy}${MM}${dd}-${HH}${mm}${ss}`;
  const taskSlug = slugify(path.basename(String(taskArg || ""), ".md"));

  return `${stamp}-${taskSlug}`;
}

function resolveRunIndexPath(runId) {
  return path.join(RUNS_DIR, `${runId}.json`);
}

function ensureRunsDir() {
  if (!fs.existsSync(RUNS_DIR)) {
    fs.mkdirSync(RUNS_DIR, { recursive: true });
  }
}

function isUnderDir(child, parent) {
  const c = path.resolve(child);
  const p = path.resolve(parent);

  return c === p || c.startsWith(p + path.sep);
}

/**
 * Regista o mapeamento run id → pasta de output no projeto (índice global leve).
 */
function writeRunIndex({
  runId,
  projectRoot,
  outputDir,
  run_type,
  workspaceRunId,
  miniActivityId,
}) {
  ensureRunsDir();

  const resolvedRoot = path.resolve(projectRoot);
  const resolvedOut = path.resolve(outputDir);

  if (path.basename(resolvedOut) !== String(runId)) {
    throw new Error(
      "writeRunIndex: o último segmento de outputDir deve ser o runId.",
    );
  }

  if (!isInsideProjectIaOutputs(resolvedRoot, resolvedOut)) {
    throw new Error(
      "writeRunIndex: outputDir deve estar sob docs/.IA/outputs ou .IA/outputs (legado).",
    );
  }

  const rel = path.relative(resolvedRoot, resolvedOut).replace(/\\/g, "/");

  const payload = {
    run_id: runId,
    project_root: resolvedRoot,
    output_dir: resolvedOut,
    output_dir_relative: rel,
    created_at: new Date().toISOString(),
  };

  if (run_type != null && String(run_type).trim() !== "") {
    payload.run_type = String(run_type).trim();
  }

  if (workspaceRunId != null && String(workspaceRunId).trim() !== "") {
    payload.workspace_run_id = String(workspaceRunId).trim();
  }

  if (miniActivityId != null && String(miniActivityId).trim() !== "") {
    payload.mini_activity_id = String(miniActivityId).trim();
  }

  try {
    const { getTraceContext, appendRuntimeTrace } = require("../scripts/runtime-observability/runtime-trace");
    if (getTraceContext()) {
      appendRuntimeTrace({
        component: "run_resolver",
        event: "run_index_written",
        phase: "run_resolver",
        step: "write_run_index",
        message: "Índice .setup-boss/runs atualizado",
        runId,
        outputDir: resolvedOut,
        projectRoot: resolvedRoot,
        derivedFrom: "artifact",
        source: "daemon",
        metadata: {
          indexPath: resolveRunIndexPath(runId),
          output_dir_relative: rel,
        },
      });
    }
  } catch (_) {
    /* opcional */
  }

  fs.writeFileSync(
    resolveRunIndexPath(runId),
    JSON.stringify(payload, null, 2),
    "utf-8"
  );

  try {
    const logger = require("../scripts/runtime/logger");
    logger.info("artifact.write", {
      kind: "run_index",
      path: resolveRunIndexPath(runId),
      runId,
      outputDir: resolvedOut,
      projectRoot: resolvedRoot,
      relative: rel,
    });
  } catch (_) {
    /* */
  }
}

function validateAllowedOutputDir(absDir) {
  const r = path.normalize(path.resolve(absDir));

  if (isUnderDir(r, LEGACY_OUTPUTS_DIR)) {
    return;
  }

  let bestRoot = null;
  let cur = r;

  for (;;) {
    const parent = path.dirname(cur);
    if (parent === cur) {
      break;
    }
    if (isInsideProjectIaOutputs(parent, r)) {
      if (!bestRoot || parent.length > bestRoot.length) {
        bestRoot = parent;
      }
    }
    cur = parent;
  }

  if (bestRoot) {
    return;
  }

  throw new Error(`resolveOutputDir: local de output não permitido: ${r}`);
}

/**
 * Resolve diretório de artefatos da corrida.
 * Aceita caminho existente, ou run id (via `.setup-boss/runs/<id>.json`), ou fallback legado `setup-boss/outputs/<id>`.
 */
function resolveOutputDir(runIdOrPath, options = {}) {
  try {
    return resolveOutputDirInner(runIdOrPath, options);
  } catch (e) {
    try {
      const logger = require("../scripts/runtime/logger");
      logger.warn("runtime.output_dir_resolve_failed", {
        query: String(runIdOrPath || "").trim().slice(0, 240),
        error: e instanceof Error ? e.message : String(e),
      });
    } catch (_) {
      /* */
    }
    throw e;
  }
}

function resolveOutputDirInner(runIdOrPath, options = {}) {
  const warnLegacy = options.warnLegacy !== false;
  const arg = String(runIdOrPath || "").trim();

  try {
    const { getTraceContext, appendRuntimeTrace } = require("../scripts/runtime-observability/runtime-trace");
    if (getTraceContext()) {
      appendRuntimeTrace({
        component: "run_resolver",
        event: "run_resolver_started",
        phase: "run_resolver",
        step: "resolve_output_dir",
        message: "resolveOutputDir iniciado",
        metadata: { argPreview: arg.slice(0, 240) },
        derivedFrom: "state",
        source: "daemon",
      });
    }
  } catch (_) {
    /* observabilidade opcional */
  }

  if (!arg) {
    throw new Error("resolveOutputDir: argumento vazio.");
  }

  if (path.isAbsolute(arg)) {
    if (fs.existsSync(arg) && fs.statSync(arg).isDirectory()) {
      validateAllowedOutputDir(arg);

      const resolved = path.resolve(arg);
      try {
        const logger = require("../scripts/runtime/logger");
        logger.info("runtime.output_dir_resolved", {
          outputDir: resolved,
          via: "absolute_path",
          query: arg.slice(0, 240),
        });
      } catch (_) {
        /* */
      }
      return resolved;
    }

    throw new Error(`resolveOutputDir: pasta não encontrada: ${arg}`);
  }

  const cwdResolved = path.resolve(process.cwd(), arg);

  if (
    fs.existsSync(cwdResolved) &&
    fs.statSync(cwdResolved).isDirectory()
  ) {
    validateAllowedOutputDir(cwdResolved);

    try {
      const logger = require("../scripts/runtime/logger");
      logger.info("runtime.output_dir_resolved", {
        outputDir: cwdResolved,
        via: "cwd_relative",
        query: arg.slice(0, 240),
      });
    } catch (_) {
      /* */
    }

    return cwdResolved;
  }

  const indexPath = resolveRunIndexPath(arg);

  if (fs.existsSync(indexPath)) {
    let idx;

    try {
      idx = JSON.parse(fs.readFileSync(indexPath, "utf-8"));
    } catch (_) {
      throw new Error(`resolveOutputDir: índice inválido: ${indexPath}`);
    }

    const pr = path.resolve(idx.project_root);
    const out = path.resolve(idx.output_dir);

    if (
      !isInsideProjectIaOutputs(pr, out) ||
      path.basename(out) !== String(idx.run_id)
    ) {
      throw new Error("resolveOutputDir: índice aponta para caminho inseguro.");
    }

    if (!fs.existsSync(out)) {
      throw new Error(`resolveOutputDir: pasta do índice ausente: ${out}`);
    }

    try {
      const logger = require("../scripts/runtime/logger");
      logger.info("runtime.output_dir_resolved", {
        outputDir: out,
        via: "run_index",
        runId: String(idx.run_id || arg).slice(0, 200),
        query: arg.slice(0, 240),
      });
    } catch (_) {
      /* */
    }

    return out;
  }

  const legacy = path.join(LEGACY_OUTPUTS_DIR, arg);

  if (fs.existsSync(legacy) && fs.statSync(legacy).isDirectory()) {
    if (warnLegacy) {
      console.warn(
        `[run-resolver] output legado: ${path.join("setup-boss", "outputs", arg)}`
      );
    }

    const resolvedLegacy = path.resolve(legacy);
    try {
      const logger = require("../scripts/runtime/logger");
      logger.info("runtime.output_dir_resolved", {
        outputDir: resolvedLegacy,
        via: "legacy_outputs",
        query: arg.slice(0, 240),
      });
    } catch (_) {
      /* */
    }

    return resolvedLegacy;
  }

  throw new Error(
    `resolveOutputDir: não foi possível resolver "${arg}". Use run id com índice em .setup-boss/runs/, caminho sob docs/.IA/outputs ou .IA/outputs do projeto, ou output legado existente.`
  );
}

module.exports = {
  ROOT_DIR,
  LEGACY_OUTPUTS_DIR,
  getRunId,
  resolveRunIndexPath,
  writeRunIndex,
  resolveOutputDir,
  validateAllowedOutputDir,
};
