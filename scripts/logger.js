const fs = require("fs");
const path = require("path");

const STEP_STATUS = new Set(["running", "success", "error", "skipped"]);
const RUN_STATUS = new Set(["running", "success", "failed", "partial"]);

class RunLogger {
  constructor({ runId, outputDir, project, task }) {
    this.runId = runId;
    this.outputDir = outputDir;
    this.logPath = path.join(outputDir, "run-log.json");

    if (!fs.existsSync(outputDir)) {
      fs.mkdirSync(outputDir, { recursive: true });
    }

    this.data = this.normalizeExistingLog(
      this.loadExistingLog() || this.createInitialLog({ runId, project, task })
    );

    this.currentStep = null;
    this.save();
  }

  createInitialLog({ runId, project, task }) {
    return {
      run_id: runId,
      project,
      task,
      status: "running",
      started_at: new Date().toISOString(),
      finished_at: null,
      steps: [],
      correction_iterations: 0,
      generated_files: [],
      errors: [],
      warnings: [],
      limits: {
        max_corrections: Number(process.env.MAX_CORRECTIONS || 3),
        max_total_steps: Number(process.env.MAX_TOTAL_STEPS || 20),
      },
      cost_latency: {
        total_duration_ms: 0,
        estimated_total_tokens: 0,
        estimated_cost_usd: 0,
      },
      cache: {
        scan_enabled: process.env.ENABLE_SCAN_CACHE !== "false",
        scan_used: false,
        scan_cache_path: null,
      },
    };
  }

  normalizeExistingLog(log) {
    if (!log.status || !RUN_STATUS.has(log.status)) {
      log.status = log.finished_at ? "partial" : "running";
    }

    if (typeof log.correction_iterations !== "number") {
      log.correction_iterations = Number(log.iterations || 0);
    }

    // Compatibilidade com versões antigas que usavam "iterations"
    delete log.iterations;

    if (!Array.isArray(log.generated_files)) {
      log.generated_files = [];
    }

    log.generated_files = log.generated_files.map((item) => {
      if (typeof item === "string") {
        return {
          path: item,
          type: "unknown",
        };
      }

      return {
        path: item.path,
        type: item.type || "unknown",
      };
    });

    if (!Array.isArray(log.steps)) log.steps = [];
    if (!Array.isArray(log.errors)) log.errors = [];
    if (!Array.isArray(log.warnings)) log.warnings = [];

    if (!log.cost_latency) {
      log.cost_latency = {
        total_duration_ms: 0,
        estimated_total_tokens: 0,
        estimated_cost_usd: 0,
      };
    }

    if (!log.cache) {
      log.cache = {
        scan_enabled: process.env.ENABLE_SCAN_CACHE !== "false",
        scan_used: false,
        scan_cache_path: null,
      };
    }

    return log;
  }

  loadExistingLog() {
    if (!fs.existsSync(this.logPath)) return null;

    try {
      return JSON.parse(fs.readFileSync(this.logPath, "utf-8"));
    } catch (_) {
      return null;
    }
  }

  startStep(name, meta = {}) {
    this.endDanglingStepIfNeeded();

    this.data.status = "running";

    this.currentStep = {
      name,
      status: "running",
      started_at: new Date().toISOString(),
      started_at_ms: Date.now(),
      finished_at: null,
      duration_ms: null,
      estimated_tokens: meta.estimated_tokens || this.getEstimatedTokens(),
      estimated_cost_usd: 0,
      meta,
    };

    this.data.steps.push(this.currentStep);
    this.save();
  }

  endStep(status = "success", meta = {}) {
    if (!this.currentStep) return;

    const safeStatus = STEP_STATUS.has(status) ? status : "success";
    const finishedAtMs = Date.now();

    this.currentStep.status = safeStatus;
    this.currentStep.finished_at = new Date().toISOString();
    this.currentStep.duration_ms = finishedAtMs - this.currentStep.started_at_ms;
    this.currentStep.estimated_cost_usd = this.calculateEstimatedCost(
      this.currentStep.estimated_tokens
    );

    this.currentStep.meta = {
      ...this.currentStep.meta,
      ...meta,
    };

    delete this.currentStep.started_at_ms;

    this.recalculateTotals();

    this.currentStep = null;
    this.save();
  }

  skipStep(name, meta = {}) {
    this.data.steps.push({
      name,
      status: "skipped",
      started_at: new Date().toISOString(),
      finished_at: new Date().toISOString(),
      duration_ms: 0,
      estimated_tokens: 0,
      estimated_cost_usd: 0,
      meta,
    });

    this.recalculateTotals();
    this.save();
  }

  failStep(error) {
    if (!this.currentStep) {
      this.data.errors.push({
        step: null,
        message: error.message || String(error),
        created_at: new Date().toISOString(),
      });

      this.data.status = "failed";
      this.save();
      return;
    }

    const finishedAtMs = Date.now();

    this.currentStep.status = "error";
    this.currentStep.finished_at = new Date().toISOString();
    this.currentStep.duration_ms = finishedAtMs - this.currentStep.started_at_ms;
    this.currentStep.estimated_cost_usd = this.calculateEstimatedCost(
      this.currentStep.estimated_tokens
    );

    delete this.currentStep.started_at_ms;

    this.data.errors.push({
      step: this.currentStep.name,
      message: error.message || String(error),
      created_at: new Date().toISOString(),
    });

    this.data.status = "failed";
    this.recalculateTotals();

    this.currentStep = null;
    this.save();
  }

  endDanglingStepIfNeeded() {
    if (!this.currentStep) return;

    this.currentStep.status = "error";
    this.currentStep.finished_at = new Date().toISOString();
    this.currentStep.duration_ms = Date.now() - this.currentStep.started_at_ms;
    this.currentStep.estimated_cost_usd = this.calculateEstimatedCost(
      this.currentStep.estimated_tokens
    );

    this.data.errors.push({
      step: this.currentStep.name,
      message: "Step anterior ficou aberto e foi encerrado automaticamente.",
      created_at: new Date().toISOString(),
    });

    delete this.currentStep.started_at_ms;

    this.currentStep = null;
    this.recalculateTotals();
  }

  addGeneratedFile(file) {
    const normalized =
      typeof file === "string"
        ? {
            path: file,
            type: "unknown",
          }
        : {
            path: file.path,
            type: file.type || "unknown",
          };

    if (!normalized.path) return;

    const alreadyExists = this.data.generated_files.some(
      (item) => item.path === normalized.path && item.type === normalized.type
    );

    if (!alreadyExists) {
      this.data.generated_files.push(normalized);
      this.save();
    }
  }

  addWarning(message, meta = {}) {
    this.data.warnings.push({
      message,
      meta,
      created_at: new Date().toISOString(),
    });

    this.save();
  }

  incrementIteration() {
    this.incrementCorrectionIteration();
  }

  incrementCorrectionIteration() {
    this.data.correction_iterations += 1;
    this.save();
  }

  setCacheInfo({ scanUsed, scanCachePath }) {
    this.data.cache.scan_used = Boolean(scanUsed);
    this.data.cache.scan_cache_path = scanCachePath || null;
    this.save();
  }

  finish(status) {
    this.endDanglingStepIfNeeded();

    this.data.finished_at = new Date().toISOString();

    if (status && RUN_STATUS.has(status)) {
      this.data.status = status;
    } else if (this.data.errors.length > 0) {
      this.data.status = "failed";
    } else if (this.data.steps.some((step) => step.status === "error")) {
      this.data.status = "partial";
    } else {
      this.data.status = "success";
    }

    this.recalculateTotals();
    this.save();
  }

  getEstimatedTokens() {
    return Number(process.env.ESTIMATED_TOKENS_PER_STEP || 1500);
  }

  calculateEstimatedCost(tokens) {
    const costPer1k = Number(process.env.COST_PER_1K_TOKENS_USD || 0.002);
    return Number(((tokens / 1000) * costPer1k).toFixed(6));
  }

  recalculateTotals() {
    const finishedSteps = this.data.steps.filter(
      (step) => typeof step.duration_ms === "number"
    );

    this.data.cost_latency.total_duration_ms = finishedSteps.reduce(
      (sum, step) => sum + step.duration_ms,
      0
    );

    this.data.cost_latency.estimated_total_tokens = finishedSteps.reduce(
      (sum, step) => sum + Number(step.estimated_tokens || 0),
      0
    );

    this.data.cost_latency.estimated_cost_usd = Number(
      finishedSteps
        .reduce((sum, step) => sum + Number(step.estimated_cost_usd || 0), 0)
        .toFixed(6)
    );
  }

  save() {
    fs.writeFileSync(this.logPath, JSON.stringify(this.data, null, 2), "utf-8");
  }
}

module.exports = RunLogger;