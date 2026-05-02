const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const { spawnSync } = require("child_process");
const RunLogger = require("./logger");

const ROOT_DIR = path.resolve(__dirname, "..");

const SOURCE_OF_TRUTH = {
  globalContextDir: path.join(ROOT_DIR, "context"),
  operationalDocsDir: path.join(ROOT_DIR, "docs"),
  outputsDir: path.join(ROOT_DIR, "outputs"),
  systemDir: path.join(ROOT_DIR, ".setup-boss"),
  projectSetupDirName: ".setup-boss",
};

const OUTPUTS_DIR = SOURCE_OF_TRUTH.outputsDir;
const CACHE_DIR = path.join(SOURCE_OF_TRUTH.systemDir, "cache");

const args = process.argv.slice(2);

const MAX_CORRECTIONS = Number(process.env.MAX_CORRECTIONS || 3);
const MAX_TOTAL_STEPS = Number(process.env.MAX_TOTAL_STEPS || 20);
const ENABLE_SCAN_CACHE = process.env.ENABLE_SCAN_CACHE !== "false";
const SCAN_CACHE_TTL_MS = Number(
  process.env.SCAN_CACHE_TTL_MS || 1000 * 60 * 10
);

console.log("[RUN] args:", args);
console.log("[RUN] ROOT_DIR:", ROOT_DIR);
console.log("[RUN] OUTPUTS_DIR:", OUTPUTS_DIR);

function ensureDir(dir) {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

function ensureFile(filePath, label) {
  if (!fs.existsSync(filePath)) {
    throw new Error(`${label} não encontrado: ${filePath}`);
  }
}

function hashInput(value) {
  return crypto.createHash("md5").update(String(value)).digest("hex");
}

function slugify(text) {
  return text
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "")
    .slice(0, 60);
}

function resolveProjectRoot(projectArg) {
  return path.resolve(ROOT_DIR, projectArg);
}

function getRunId(taskArg, projectArg) {
  const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
  const projectName = path.basename(resolveProjectRoot(projectArg));
  const taskName = slugify(path.basename(taskArg, ".md"));

  return `${timestamp}-${projectName}-${taskName}`;
}

function getScanCachePath(projectArg) {
  ensureDir(CACHE_DIR);

  return path.join(
    CACHE_DIR,
    `scan-${hashInput(resolveProjectRoot(projectArg))}.md`
  );
}

function runNode(script, scriptArgs = [], options = {}) {
  console.log(`[RUN_NODE] start: ${script}`);
  console.log("[RUN_NODE] args:", scriptArgs);
  console.log("[RUN_NODE] command:", process.execPath);

  const spawnOptions = {
    cwd: ROOT_DIR,
    encoding: "utf-8",
    shell: false,
    windowsHide: true,
  };

  console.log("[RUN_NODE] shell:", spawnOptions.shell);

  const result = spawnSync(
    process.execPath,
    [path.join(ROOT_DIR, "scripts", script), ...scriptArgs],
    spawnOptions
  );

  if (result.stdout) process.stdout.write(result.stdout);
  if (result.stderr) process.stderr.write(result.stderr);

  console.log(`[RUN_NODE] end: ${script}`);
  console.log("[RUN_NODE] status:", result.status);
  console.log("[RUN_NODE] signal:", result.signal);
  console.log("[RUN_NODE] error:", result.error?.message || null);

  if (!options.allowFailure && result.status !== 0) {
    throw new Error(`Falha ao executar ${script}`);
  }

  return result;
}

function extractOutputName(stdout) {
  const match = stdout.match(/npm run cursor\s+([^\s]+)/);

  if (!match) {
    throw new Error(
      "Não foi possível identificar o outputName. Verifique se architect.js imprime: npm run cursor <outputName>"
    );
  }

  return match[1].trim();
}

function getOutputDir(outputName) {
  return path.join(OUTPUTS_DIR, outputName);
}

function isFreshCache(filePath) {
  if (!fs.existsSync(filePath)) return false;

  const stats = fs.statSync(filePath);
  return Date.now() - stats.mtimeMs <= SCAN_CACHE_TTL_MS;
}

function copyCachedScanToOutput(cachePath, outputDir) {
  const scanOutputPath = path.join(outputDir, "scan-output.md");

  if (fs.existsSync(cachePath)) {
    fs.copyFileSync(cachePath, scanOutputPath);
    return true;
  }

  return false;
}

function saveScanToCache(outputDir, cachePath) {
  const scanOutputPath = path.join(outputDir, "scan-output.md");

  if (fs.existsSync(scanOutputPath)) {
    fs.copyFileSync(scanOutputPath, cachePath);
    return true;
  }

  return false;
}

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf-8"));
}

function readRunLog(outputDir) {
  const logPath = path.join(outputDir, "run-log.json");

  if (!fs.existsSync(logPath)) return null;

  return readJson(logPath);
}

function assertOutputInsideOutputs(outputDir) {
  const resolved = path.resolve(outputDir);
  const allowed = path.resolve(OUTPUTS_DIR);

  if (resolved !== allowed && !resolved.startsWith(allowed + path.sep)) {
    throw new Error("Output fora do diretório permitido.");
  }
}

function assertFlowLimits(logger, outputDir) {
  const log = readRunLog(outputDir);

  if (!log) return;

  const correctionIterations =
    Number(log.correction_iterations ?? log.iterations ?? 0) || 0;

  if (correctionIterations >= MAX_CORRECTIONS) {
    logger.addWarning("Limite máximo de correções atingido.", {
      correction_iterations: correctionIterations,
      max_corrections: MAX_CORRECTIONS,
    });

    throw new Error(
      `MAX_CORRECTIONS excedido: ${correctionIterations}/${MAX_CORRECTIONS}`
    );
  }

  const stepsCount = Array.isArray(log.steps) ? log.steps.length : 0;

  if (stepsCount >= MAX_TOTAL_STEPS) {
    logger.addWarning("Limite máximo de etapas atingido.", {
      steps: stepsCount,
      max_total_steps: MAX_TOTAL_STEPS,
    });

    throw new Error(`MAX_TOTAL_STEPS excedido: ${stepsCount}/${MAX_TOTAL_STEPS}`);
  }
}

function addGeneratedFile(logger, outputName, relativeFilePath, type) {
  const normalizedPath = `outputs/${outputName}/${relativeFilePath}`.replace(
    /\\/g,
    "/"
  );

  try {
    logger.addGeneratedFile({
      path: normalizedPath,
      type,
    });
  } catch {
    logger.addGeneratedFile(normalizedPath);
  }
}

function createCursorOutputPlaceholder(outputName) {
  const cursorOutputPath = path.join(
    getOutputDir(outputName),
    "cursor-output.md"
  );

  if (!fs.existsSync(cursorOutputPath)) {
    fs.writeFileSync(
      cursorOutputPath,
      `# Cursor Output

Cole aqui a resposta completa do Cursor.

Depois rode:

npm run run continue ${outputName}
`,
      "utf-8"
    );
  }
}

function assertCursorOutputFilled(outputName) {
  const cursorOutputPath = path.join(
    getOutputDir(outputName),
    "cursor-output.md"
  );

  ensureFile(cursorOutputPath, "cursor-output.md");

  const content = fs.readFileSync(cursorOutputPath, "utf-8");

  if (
    !content.trim() ||
    content.includes("Cole aqui a resposta completa do Cursor")
  ) {
    throw new Error(
      `cursor-output.md ainda está vazio ou com placeholder: ${cursorOutputPath}`
    );
  }
}

function startFlow(taskArg, projectArg) {
  if (!taskArg || !projectArg) {
    console.log("Uso:");
    console.log("npm run run tasks/exemplo.md ../landing-sofas");
    process.exit(1);
  }

  console.log("🚀 Setup Boss iniciado");

  let logger;

  try {
    ensureDir(OUTPUTS_DIR);
    ensureDir(CACHE_DIR);

    const runId = getRunId(taskArg, projectArg);
    const outputDir = getOutputDir(runId);

    ensureDir(outputDir);
    assertOutputInsideOutputs(outputDir);

    const scanCachePath = getScanCachePath(projectArg);
    const canUseScanCache = ENABLE_SCAN_CACHE && isFreshCache(scanCachePath);

    logger = new RunLogger({
      runId,
      outputDir,
      project: projectArg,
      task: taskArg,
    });

    logger.startStep("architect", {
      scan_cache_enabled: ENABLE_SCAN_CACHE,
      scan_cache_used: canUseScanCache,
    });

    const architectArgs = [taskArg, projectArg, `--run-id=${runId}`];

    if (canUseScanCache) {
      architectArgs.push("--skip-scan");
    }

    console.log("[RUN] runId:", runId);
    console.log("[RUN] outputDir:", outputDir);
    console.log("[RUN] canUseScanCache:", canUseScanCache);
    console.log("[RUN] architectArgs:", architectArgs);

    console.log("Etapa 1 — Architect + Scan");

    const architectResult = runNode("architect.js", architectArgs);
    const outputName = extractOutputName(architectResult.stdout || "");

    if (outputName !== runId) {
      logger.addWarning("Mismatch entre runId e outputName.", {
        runId,
        outputName,
      });
    }

    if (canUseScanCache) {
      const copied = copyCachedScanToOutput(scanCachePath, outputDir);

      logger.setCacheInfo({
        scanUsed: copied,
        scanCachePath,
      });

      if (copied) {
        addGeneratedFile(logger, runId, "scan-output.md", "scan_output");
      }
    } else {
      const saved = saveScanToCache(outputDir, scanCachePath);

      logger.setCacheInfo({
        scanUsed: false,
        scanCachePath: saved ? scanCachePath : null,
      });

      if (saved) {
        addGeneratedFile(logger, runId, "scan-output.md", "scan_output");
      }
    }

    addGeneratedFile(logger, runId, "architect-input.md", "architect_input");
    addGeneratedFile(logger, runId, "architect-output.md", "architect_output");
    addGeneratedFile(logger, runId, "task.md", "task");
    addGeneratedFile(logger, runId, "metadata.json", "metadata");

    logger.endStep("success");

    logger.startStep("architect_validation");

    runNode("validate-architect.js", [runId]);

    addGeneratedFile(
      logger,
      runId,
      "architect-validation.json",
      "architect_validation"
    );

    logger.endStep("success");

    logger.startStep("cursor_prompt");

    runNode("cursor.js", [runId]);

    addGeneratedFile(logger, runId, "cursor-prompt.md", "cursor_prompt");
    addGeneratedFile(
      logger,
      runId,
      "cursor-allowed-files.json",
      "cursor_allowed_files"
    );

    createCursorOutputPlaceholder(runId);

    addGeneratedFile(logger, runId, "cursor-output.md", "cursor_output");

    logger.endStep("success");

    logger.finish();

    console.log("\n⏸️ Pausa obrigatória");
    console.log(
      `Após executar no Cursor, salve o resultado em outputs/${runId}/cursor-output.md`
    );
    console.log(`npm run run continue ${runId}`);
  } catch (error) {
    if (logger) {
      logger.failStep(error);
      logger.finish();
    }

    console.error("❌ Erro:", error.message);
    process.exit(1);
  }
}

function continueFlow(outputName) {
  if (!outputName) {
    console.log("Uso:");
    console.log("npm run run continue <outputName>");
    process.exit(1);
  }

  const outputDir = getOutputDir(outputName);

  const logger = new RunLogger({
    runId: outputName,
    outputDir,
    project: "",
    task: "",
  });

  try {
    assertOutputInsideOutputs(outputDir);
    ensureFile(outputDir, "Pasta de output");
    assertCursorOutputFilled(outputName);
    assertFlowLimits(logger, outputDir);

    logger.incrementCorrectionIteration();

    logger.startStep("cursor_enforcement");

    runNode("validate-cursor.js", [outputName]);

    addGeneratedFile(
      logger,
      outputName,
      "cursor-validation.json",
      "cursor_validation"
    );

    logger.endStep("success");

    logger.startStep("review");

    runNode("review.js", [outputName], { allowFailure: true });

    addGeneratedFile(logger, outputName, "review-output.json", "review_output");
    addGeneratedFile(logger, outputName, "review-output.md", "review_report");

    logger.endStep("success");

    const reviewPath = path.join(outputDir, "review-output.json");

    if (!fs.existsSync(reviewPath)) {
      throw new Error("review-output.json não foi gerado.");
    }

    const review = readJson(reviewPath);

    if (review.status === "approved") {
      logger.startStep("knowledge");

      runNode("knowledge.js", [outputName]);

      addGeneratedFile(
        logger,
        outputName,
        "knowledge-update.md",
        "knowledge_update"
      );

      logger.endStep("success");
      logger.finish();

      console.log("✅ Finalizado com sucesso");
      return;
    }

    if (review.status === "blocked") {
      logger.addWarning("Review bloqueado.", {
        review_status: review.status,
        blocking_issues: review.blocking_issues || [],
      });

      logger.finish("partial");

      console.log("⛔ Review bloqueado.");
      console.log("Corrija a definição/estado da task antes de continuar.");
      return;
    }

    if (review.requires_correction === false) {
      logger.addWarning("Review reprovou, mas não solicitou correção.", {
        review_status: review.status,
      });

      throw new Error("REVIEW_FAILED_WITHOUT_CORRECTION_PATH");
    }

    assertFlowLimits(logger, outputDir);

    logger.startStep("correction");

    runNode("correction.js", [outputName]);

    addGeneratedFile(
      logger,
      outputName,
      "correction-prompt.md",
      "correction_prompt"
    );

    logger.endStep("success");
    logger.finish("partial");

    console.log("⚠️ Correção necessária");
    console.log(`npm run cursor ${outputName}`);
    console.log(
      `Após executar no Cursor, salve o resultado em outputs/${outputName}/cursor-output.md`
    );
    console.log(`npm run run continue ${outputName}`);
  } catch (error) {
    logger.failStep(error);
    logger.finish("failed");

    console.error("❌ Erro:", error.message);
    process.exit(1);
  }
}

function main() {
  if (args[0] === "continue") {
    continueFlow(args[1]);
    return;
  }

  startFlow(args[0], args[1]);
}

main();