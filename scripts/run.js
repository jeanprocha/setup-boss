const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const { spawn } = require("child_process");
const RunLogger = require("./logger");
const { appendProblemHistoryEntry } = require("../core/problem-history");
const { getRunId, writeRunIndex } = require("../core/run-resolver");

const ROOT_DIR = path.resolve(__dirname, "..");

function formatDuration(ms) {
  if (ms < 1000) return `${ms}ms`;

  const seconds = Math.round(ms / 1000);

  if (seconds < 60) return `${seconds}s`;

  const minutes = Math.floor(seconds / 60);
  const rest = seconds % 60;

  return `${minutes}m ${rest}s`;
}

function logStepStart(name, action, description) {
  console.log(`\n▶ ${name} → ${action}`);

  if (description) {
    console.log(`   ${description}`);
  }

  return Date.now();
}

function logStepEnd(name, startedAt) {
  const duration = Date.now() - startedAt;
  console.log(`⏱ ${name} finalizado em ${formatDuration(duration)}`);
}

function summarizeReviewIssues(review) {
  const issues = [];

  if (Array.isArray(review.blocking_issues)) {
    issues.push(...review.blocking_issues);
  }

  if (Array.isArray(review.warnings)) {
    issues.push(...review.warnings);
  }

  if (issues.length === 0) {
    return review.summary || "Review solicitou correção sem detalhes.";
  }

  return issues[0];
}

const SOURCE_OF_TRUTH = {
  globalContextDir: path.join(ROOT_DIR, "context"),
  operationalDocsDir: path.join(ROOT_DIR, "docs"),
  systemDir: path.join(ROOT_DIR, ".setup-boss"),
  projectSetupDirName: ".setup-boss",
};

const CACHE_DIR = path.join(SOURCE_OF_TRUTH.systemDir, "cache");

const FORCE_SCAN_FLAG = "--force-scan";

const rawCliArgs = process.argv.slice(2);
const forceScan =
  rawCliArgs.includes(FORCE_SCAN_FLAG) ||
  process.env.FORCE_SCAN === "1" ||
  /^true$/i.test(String(process.env.FORCE_SCAN || ""));
const args = rawCliArgs.filter((a) => a !== FORCE_SCAN_FLAG);

const MAX_CORRECTIONS = Number(process.env.MAX_CORRECTIONS || 3);
const MAX_TOTAL_STEPS = Number(process.env.MAX_TOTAL_STEPS || 20);
const ENABLE_SCAN_CACHE = process.env.ENABLE_SCAN_CACHE !== "false";
const SCAN_CACHE_TTL_MS = Number(
  process.env.SCAN_CACHE_TTL_MS || 1000 * 60 * 10
);

console.log("[RUN] args:", rawCliArgs);
console.log("[RUN] ROOT_DIR:", ROOT_DIR);
console.log("[RUN] forceScan (--force-scan ou FORCE_SCAN=1|true):", forceScan);

function ensureDir(dir) {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

function hashInput(value) {
  return crypto.createHash("md5").update(String(value)).digest("hex");
}

function resolveProjectRoot(projectArg) {
  return path.resolve(ROOT_DIR, projectArg);
}

function getProjectIADir(projectArg) {
  return path.join(resolveProjectRoot(projectArg), ".IA");
}

function getProjectOutputsDir(projectArg) {
  return path.join(getProjectIADir(projectArg), "outputs");
}

function getOutputDirForProject(projectArg, runId) {
  return path.join(getProjectOutputsDir(projectArg), runId);
}

function getScanCachePath(projectArg) {
  ensureDir(CACHE_DIR);

  return path.join(
    CACHE_DIR,
    `scan-${hashInput(resolveProjectRoot(projectArg))}.md`
  );
}

function runNode(script, scriptArgs = [], options = {}) {
  return new Promise((resolve, reject) => {
    console.log(`\n▶ Executando: ${script}`);

    const scriptPath = path.join(ROOT_DIR, "scripts", script);

    const child = spawn(process.execPath, [scriptPath, ...scriptArgs], {
      cwd: ROOT_DIR,
      stdio: ["ignore", "pipe", "pipe"],
      windowsHide: true,
    });

    let stdoutBuf = "";
    let stderrBuf = "";

    child.stdout.on("data", (data) => {
      process.stdout.write(data);
      stdoutBuf += data.toString();
    });

    child.stderr.on("data", (data) => {
      process.stderr.write(data);
      stderrBuf += data.toString();
    });

    child.on("close", (code) => {
      console.log(`✔ Finalizado: ${script}`);
      console.log(`[status]:`, code);

      if (!options.allowFailure && code !== 0) {
        return reject(new Error(`Falha ao executar ${script}`));
      }

      resolve({
        status: code,
        stdout: stdoutBuf,
        stderr: stderrBuf,
      });
    });

    child.on("error", (err) => {
      reject(err);
    });
  });
}

function extractOutputName(stdout) {
  const match = stdout.match(/npm run executor\s+([^\s]+)/);

  if (!match) {
    throw new Error(
      "Não foi possível identificar o outputName. Verifique se architect.js imprime: npm run executor <outputName>"
    );
  }

  return match[1].trim();
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

function assertOutputInsideProjectIA(projectRoot, outputDir) {
  const root = path.resolve(projectRoot);
  const resolved = path.resolve(outputDir);
  const allowedBase = path.join(root, ".IA", "outputs");

  if (
    resolved !== allowedBase &&
    !resolved.startsWith(allowedBase + path.sep)
  ) {
    throw new Error("Output fora de project/.IA/outputs.");
  }
}

function assertFlowLimits(logger, outputDir) {
  const log = readRunLog(outputDir);

  if (!log) return;

  const stepsCount = Array.isArray(log.steps) ? log.steps.length : 0;

  if (stepsCount >= MAX_TOTAL_STEPS) {
    logger.addWarning("Limite máximo de etapas atingido.", {
      steps: stepsCount,
      max_total_steps: MAX_TOTAL_STEPS,
    });

    throw new Error(`MAX_TOTAL_STEPS excedido: ${stepsCount}/${MAX_TOTAL_STEPS}`);
  }
}

function addGeneratedFile(logger, runId, relativeFilePath, type) {
  const normalizedPath = `.IA/outputs/${runId}/${relativeFilePath}`.replace(
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

async function runExecutorStep(logger, runId) {
  assertFlowLimits(logger, logger.outputDir);

  const startedAt = logStepStart(
    "Executor",
    "aplicando alterações",
    "Lendo arquivos permitidos e aplicando mudanças no projeto."
  );

  logger.startStep("executor");

  await runNode("executor.js", [runId]);

  addGeneratedFile(logger, runId, "executor-input.md", "executor_input");
  addGeneratedFile(logger, runId, "executor-result.json", "executor_result");
  addGeneratedFile(logger, runId, "executor-output.md", "executor_output");
  addGeneratedFile(logger, runId, "executor-changes.json", "executor_changes");

  logger.endStep("success");

  logStepEnd("Executor", startedAt);
}

async function runReviewStep(logger, runId) {
  assertFlowLimits(logger, logger.outputDir);

  const startedAt = logStepStart(
    "Review",
    "validando resultado",
    "Conferindo se a execução atende aos critérios da task."
  );

  logger.startStep("review");

  await runNode("review.js", [runId], { allowFailure: true });

  addGeneratedFile(logger, runId, "review-output.json", "review_output");
  addGeneratedFile(logger, runId, "review-output.md", "review_report");

  logger.endStep("success");

  logStepEnd("Review", startedAt);

  const reviewPath = path.join(logger.outputDir, "review-output.json");

  if (!fs.existsSync(reviewPath)) {
    throw new Error("review-output.json não foi gerado.");
  }

  return readJson(reviewPath);
}

async function finishKnowledge(logger, runId) {
  const startedAt = logStepStart(
    "Knowledge",
    "registrando aprendizado",
    "Salvando decisões úteis para próximas execuções."
  );

  logger.startStep("knowledge");

  await runNode("knowledge.js", [runId]);

  addGeneratedFile(logger, runId, "knowledge-update.md", "knowledge_update");

  logger.endStep("success");

  logStepEnd("Knowledge", startedAt);

  logger.finish();

  console.log("✅ Finalizado com sucesso");
}

async function startFlow(taskArg, projectArg, flowOptions = {}) {
  const forceScanFresh = flowOptions.forceScan === true;

  if (!taskArg || !projectArg) {
    console.log("Uso:");
    console.log("npm run run tasks/exemplo.md ../landing-sofas");
    process.exit(1);
  }

  console.log("🚀 Setup Boss iniciado");

  let logger;

  try {
    const projectRoot = resolveProjectRoot(projectArg);
    const projectOutputsDir = getProjectOutputsDir(projectArg);

    ensureDir(CACHE_DIR);
    ensureDir(getProjectIADir(projectArg));
    ensureDir(projectOutputsDir);

    const runId = getRunId(taskArg);
    const outputDir = getOutputDirForProject(projectArg, runId);

    ensureDir(outputDir);
    assertOutputInsideProjectIA(projectRoot, outputDir);

    writeRunIndex({ runId, projectRoot, outputDir });

    const scanCachePath = getScanCachePath(projectArg);
    const canUseScanCache =
      ENABLE_SCAN_CACHE && isFreshCache(scanCachePath) && !forceScanFresh;

    if (forceScanFresh) {
      console.log(
        "[RUN] force-scan ativo: cache de scan ignorado; scan fresco nesta run."
      );
    }

    logger = new RunLogger({
      runId,
      outputDir,
      project: projectArg,
      task: taskArg,
    });

    logger.data.cache.scan_forced = Boolean(forceScanFresh);
    logger.save();

    logger.startStep("architect", {
      scan_cache_enabled: ENABLE_SCAN_CACHE,
      scan_cache_used: canUseScanCache,
      scan_forced: Boolean(forceScanFresh),
    });

    const architectArgs = [taskArg, projectArg, `--run-id=${runId}`];

    if (canUseScanCache) {
      architectArgs.push("--skip-scan");
    }

    console.log("[RUN] runId:", runId);
    console.log("[RUN] projectOutputsDir:", projectOutputsDir);
    console.log("[RUN] outputDir:", outputDir);
    console.log("[RUN] canUseScanCache:", canUseScanCache);
    console.log("[RUN] architectArgs:", architectArgs);

    console.log("Etapa — Architect + Scan");

    const architectStartedAt = logStepStart(
      "Architect",
      "gerando plano",
      "Lendo task, scan do projeto e montando plano de execução."
    );

    const architectResult = await runNode("architect.js", architectArgs);
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

    await runNode("validate-architect.js", [runId]);

    addGeneratedFile(
      logger,
      runId,
      "architect-validation.json",
      "architect_validation"
    );

    logStepEnd("Architect", architectStartedAt);

    logger.endStep("success");

    await runExecutorStep(logger, runId);

    for (;;) {
      const review = await runReviewStep(logger, runId);

      if (review.status === "approved") {
        await finishKnowledge(logger, runId);
        return;
      }

      if (review.status === "blocked") {
        logger.addWarning("Review bloqueado.", {
          review_status: review.status,
          blocking_issues: review.blocking_issues || [],
        });

        appendProblemHistoryEntry({
          outputDir: logger.outputDir,
          step: "run",
          status: "blocked",
          severity: "high",
          type: "review_blocked",
          title: "Pipeline parado por review bloqueado",
          summary: summarizeReviewIssues(review),
          cause: "review_stopped_pipeline",
          evidence: [
            ...(review.blocking_issues || []).map((x) => String(x).slice(0, 500)),
            ...(review.warnings || []).map((x) => String(x).slice(0, 500)),
          ].slice(0, 25),
          files: [],
          extra: {
            acceptance_level: review.acceptance_level,
            requires_correction: review.requires_correction,
            blocking_issues: review.blocking_issues || [],
            warnings: review.warnings || [],
          },
        });

        logger.finish("partial");

        console.log("⛔ Review bloqueado.");
        console.log("Corrija a definição/estado da task antes de rodar de novo.");
        return;
      }

      if (review.requires_correction === false) {
        logger.addWarning("Review reprovou, mas não solicitou correção.", {
          review_status: review.status,
        });

        throw new Error("REVIEW_FAILED_WITHOUT_CORRECTION_PATH");
      }

      if (logger.data.correction_iterations >= MAX_CORRECTIONS) {
        logger.addWarning("Limite máximo de correções atingido.", {
          correction_iterations: logger.data.correction_iterations,
          max_corrections: MAX_CORRECTIONS,
        });

        appendProblemHistoryEntry({
          outputDir: logger.outputDir,
          step: "run",
          status: "failed",
          severity: "high",
          type: "correction_loop_limit",
          title: "Limite de correções atingido sem aprovação",
          summary: `MAX_CORRECTIONS (${MAX_CORRECTIONS}) atingido.`,
          cause: "max_corrections",
          evidence: [
            `correction_iterations=${logger.data.correction_iterations}`,
          ],
          files: [],
          extra: {
            correction_iterations: logger.data.correction_iterations,
            max_corrections: MAX_CORRECTIONS,
          },
        });

        logger.finish("partial");

        console.log(
          `⚠️ MAX_CORRECTIONS (${MAX_CORRECTIONS}) atingido sem aprovação.`
        );
        return;
      }

      const reason = summarizeReviewIssues(review);

      console.log(
        `\n🔁 Iteração de correção #${logger.data.correction_iterations + 1}`
      );
      console.log(`   Motivo: ${reason}`);

      logger.incrementCorrectionIteration();

      const correctionStartedAt = logStepStart(
        "Correction",
        "ajustando problemas",
        "Gerando instruções objetivas para nova execução."
      );

      logger.startStep("correction");

      await runNode("correction.js", [runId]);

      addGeneratedFile(
        logger,
        runId,
        "correction-instructions.md",
        "correction_instructions"
      );

      logger.endStep("success");

      logStepEnd("Correction", correctionStartedAt);

      await runExecutorStep(logger, runId);
    }
  } catch (error) {
    if (logger && logger.outputDir) {
      const msg = String(error.message || error || "");

      if (msg.includes("MAX_TOTAL_STEPS")) {
        appendProblemHistoryEntry({
          outputDir: logger.outputDir,
          step: "run",
          status: "failed",
          severity: "critical",
          type: "max_total_steps_limit",
          title: "Limite máximo de etapas atingido",
          summary: msg.slice(0, 800),
          cause: "max_total_steps",
          evidence: [msg.slice(0, 1200)],
          files: [],
          extra: {
            max_total_steps: MAX_TOTAL_STEPS,
          },
        });
      } else {
        appendProblemHistoryEntry({
          outputDir: logger.outputDir,
          step: "run",
          status: "error",
          severity: "critical",
          type: "unknown_error",
          title: "Erro fatal no pipeline",
          summary: msg.slice(0, 800),
          cause: "fatal",
          evidence: [String(error.stack || msg).slice(0, 2000)],
          files: [],
          extra: {},
        });
      }
    }

    if (logger) {
      logger.failStep(error);
      logger.finish();
    }

    console.error("❌ Erro:", error.message);
    process.exit(1);
  }
}

async function main() {
  await startFlow(args[0], args[1], { forceScan });
}

main().catch((error) => {
  console.error("❌ Erro:", error.message || error);
  process.exit(1);
});
