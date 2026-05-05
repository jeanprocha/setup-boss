const fs = require("fs");
const path = require("path");

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
function writeRunIndex({ runId, projectRoot, outputDir }) {
  ensureRunsDir();

  const resolvedRoot = path.resolve(projectRoot);
  const resolvedOut = path.resolve(outputDir);
  const expected = path.join(resolvedRoot, ".IA", "outputs", runId);

  if (path.resolve(resolvedOut) !== path.resolve(expected)) {
    throw new Error(
      "writeRunIndex: outputDir deve ser projectRoot/.IA/outputs/<runId>."
    );
  }

  const rel = path.join(".IA", "outputs", runId).replace(/\\/g, "/");

  const payload = {
    run_id: runId,
    project_root: resolvedRoot,
    output_dir: resolvedOut,
    output_dir_relative: rel,
    created_at: new Date().toISOString(),
  };

  fs.writeFileSync(
    resolveRunIndexPath(runId),
    JSON.stringify(payload, null, 2),
    "utf-8"
  );
}

function validateAllowedOutputDir(absDir) {
  const r = path.resolve(absDir);
  const parts = r.split(path.sep);
  const iaIdx = parts.lastIndexOf(".IA");

  if (
    iaIdx >= 0 &&
    parts[iaIdx + 1] === "outputs" &&
    parts.length > iaIdx + 2
  ) {
    return;
  }

  if (isUnderDir(r, LEGACY_OUTPUTS_DIR)) {
    return;
  }

  throw new Error(`resolveOutputDir: local de output não permitido: ${r}`);
}

/**
 * Resolve diretório de artefatos da corrida.
 * Aceita caminho existente, ou run id (via `.setup-boss/runs/<id>.json`), ou fallback legado `setup-boss/outputs/<id>`.
 */
function resolveOutputDir(runIdOrPath, options = {}) {
  const warnLegacy = options.warnLegacy !== false;
  const arg = String(runIdOrPath || "").trim();

  if (!arg) {
    throw new Error("resolveOutputDir: argumento vazio.");
  }

  if (path.isAbsolute(arg)) {
    if (fs.existsSync(arg) && fs.statSync(arg).isDirectory()) {
      validateAllowedOutputDir(arg);

      return path.resolve(arg);
    }

    throw new Error(`resolveOutputDir: pasta não encontrada: ${arg}`);
  }

  const cwdResolved = path.resolve(process.cwd(), arg);

  if (
    fs.existsSync(cwdResolved) &&
    fs.statSync(cwdResolved).isDirectory()
  ) {
    validateAllowedOutputDir(cwdResolved);

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
    const expected = path.join(pr, ".IA", "outputs", idx.run_id);

    if (path.resolve(out) !== path.resolve(expected)) {
      throw new Error("resolveOutputDir: índice aponta para caminho inseguro.");
    }

    if (!fs.existsSync(out)) {
      throw new Error(`resolveOutputDir: pasta do índice ausente: ${out}`);
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

    return path.resolve(legacy);
  }

  throw new Error(
    `resolveOutputDir: não foi possível resolver "${arg}". Use run id com índice em .setup-boss/runs/, caminho sob project/.IA/outputs, ou output legado existente.`
  );
}

module.exports = {
  ROOT_DIR,
  LEGACY_OUTPUTS_DIR,
  getRunId,
  resolveRunIndexPath,
  writeRunIndex,
  resolveOutputDir,
};
