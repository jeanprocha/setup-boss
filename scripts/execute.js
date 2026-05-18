#!/usr/bin/env node

require("dotenv").config({ quiet: true });

const path = require("path");
const fs = require("fs");
const { resolveOutputDir } = require("../core/run-resolver");
const { runExecutionRuntimeBase } = require("./runtime/execution-runtime/run-execution-runtime");
const { validateExecutionRuntimeResult } = require("./runtime/execution-runtime/validate-execution-runtime");
const { loadHandoffAndOrderForExecution } = require("./runtime/execution-runtime/build-execution-session");
const { runManualRollbackLastValidSnapshot, ensureRollbackContractMvp } = require("./runtime/execution-runtime/manage-execution-rollback");
const { buildExecutionObservability } = require("./runtime/execution-runtime/build-execution-observability");
const { validateExecuteCliFlagCombinations } = require("./runtime/execution-runtime/validate-execute-cli");

const rawCliArgs = process.argv.slice(2);

/**
 * @param {string[]} argv
 * @returns {{ run: string|null, json: boolean, force: boolean, resume: boolean, rollback: boolean, observability: boolean }}
 */
function parseExecuteCliArgs(argv) {
  const opts = { run: null, json: false, force: false, resume: false, rollback: false, observability: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--json") {
      opts.json = true;
      continue;
    }
    if (a === "--observability") {
      opts.observability = true;
      continue;
    }
    if (a === "--rollback") {
      opts.rollback = true;
      continue;
    }
    if (a === "--resume") {
      opts.resume = true;
      continue;
    }
    if (a === "--force") {
      opts.force = true;
      continue;
    }
    if (a === "--run") {
      opts.run = argv[++i] != null ? String(argv[i]) : "";
      continue;
    }
    if (a.startsWith("--run=")) {
      opts.run = a.slice("--run=".length);
      continue;
    }
  }
  if (opts.run != null) opts.run = String(opts.run).trim();
  return opts;
}

async function main() {
  const parsed = parseExecuteCliArgs(rawCliArgs);
  const runArg = parsed.run != null ? String(parsed.run).trim() : "";

  if (!runArg) {
    const err = {
      ok: false,
      error: {
        code: "EXECUTE_CLI_USAGE",
        message: "Uso: npm run execute -- --run <runId|pasta-output> [--resume] [--force] [--rollback] [--observability] [--json]",
      },
    };
    if (parsed.json) {
      console.log(JSON.stringify(err, null, 2));
    } else {
      console.error(err.error.message);
    }
    process.exitCode = 1;
    return;
  }

  const comb = validateExecuteCliFlagCombinations(parsed);
  if (!comb.ok) {
    const err = {
      ok: false,
      error: {
        code: "EXECUTE_CLI_FLAGS",
        message: comb.errors.join(" "),
      },
    };
    if (parsed.json) console.log(JSON.stringify(err, null, 2));
    else console.error(err.error.message);
    process.exitCode = 1;
    return;
  }
  if (comb.warnings.length && parsed.json) {
    /* json: incluir avisos no primeiro payload útil */
  } else if (comb.warnings.length) {
    for (const w of comb.warnings) console.warn(w);
  }

  let outputDir;
  try {
    outputDir = resolveOutputDir(runArg);
  } catch (e) {
    const msg = e && /** @type {Error} */ (e).message ? String(/** @type {Error} */ (e).message) : String(e);
    const err = {
      ok: false,
      error: { code: "EXECUTE_RESOLVE_FAILED", message: msg },
    };
    if (parsed.json) {
      console.log(JSON.stringify(err, null, 2));
    } else {
      console.error(msg);
    }
    process.exitCode = 1;
    return;
  }

  const outputDirAbs = path.resolve(outputDir);
  const runId = path.basename(outputDirAbs);

  if (parsed.observability) {
    ensureRollbackContractMvp(outputDirAbs);
    const loadedObs = loadHandoffAndOrderForExecution(outputDirAbs);
    if (!loadedObs.ok) {
      const err = {
        ok: false,
        error: loadedObs.error || { code: "OBSERVABILITY_LOAD_FAILED", message: "Handoff inválido." },
      };
      if (parsed.json) console.log(JSON.stringify(err, null, 2));
      else console.error(err.error.message || JSON.stringify(err.error));
      process.exitCode = 1;
      return;
    }
    const bo = buildExecutionObservability({
      outputDirAbs,
      force: parsed.force,
      recordDiagnosticEvents: parsed.force,
    });
    if (!bo.ok) {
      const err = { ok: false, error: bo.error || { code: "OBSERVABILITY_FAILED", message: "Observability falhou." } };
      if (parsed.json) console.log(JSON.stringify(err, null, 2));
      else console.error(err.error.message || JSON.stringify(err.error));
      process.exitCode = 1;
      return;
    }
    const validationObs = validateExecutionRuntimeResult(outputDirAbs);
    if (!validationObs.ok) {
      const err = {
        ok: false,
        error: {
          code: "EXECUTE_VALIDATION_FAILED",
          message: validationObs.errors.join(" | "),
        },
      };
      if (parsed.json) console.log(JSON.stringify(err, null, 2));
      else console.error(err.error.message);
      process.exitCode = 1;
      return;
    }
    if (validationObs.warnings && validationObs.warnings.length && !parsed.json) {
      for (const w of validationObs.warnings) console.warn(w);
    }
    if (parsed.json) {
      console.log(
        JSON.stringify(
          {
            ok: true,
            runId,
            outputDir: outputDirAbs,
            observability: true,
            skipped: Boolean(bo.skipped),
            path: bo.path,
          },
          null,
          2,
        ),
      );
    } else {
      console.log(
        bo.skipped
          ? `Observability em dia (skip): ${runId}`
          : `Observability atualizada: ${runId}`,
      );
    }
    return;
  }

  if (parsed.rollback) {
    const loaded = loadHandoffAndOrderForExecution(outputDirAbs);
    if (!loaded.ok) {
      const err = {
        ok: false,
        error: loaded.error || { code: "ROLLBACK_LOAD_FAILED", message: "Handoff inválido." },
      };
      if (parsed.json) {
        console.log(JSON.stringify(err, null, 2));
      } else {
        console.error(err.error.message || JSON.stringify(err.error));
      }
      process.exitCode = 1;
      return;
    }
    const execDir = path.join(outputDirAbs, "execution");
    if (!fs.existsSync(execDir)) {
      const err = { ok: false, error: { code: "ROLLBACK_NO_EXEC", message: "Pasta execution/ em falta." } };
      if (parsed.json) console.log(JSON.stringify(err, null, 2));
      else console.error(err.error.message);
      process.exitCode = 1;
      return;
    }
    /** @type {{ type: string, recorded_at: string, payload?: Record<string, unknown> }[]} */
    const events = [];
    const iso = () => new Date().toISOString();
    const rr = runManualRollbackLastValidSnapshot({
      outputDirAbs,
      loaded,
      execDir,
      force: parsed.force,
      events,
      iso,
    });
    if (!rr.ok) {
      const err = { ok: false, error: rr.error || { code: "ROLLBACK_FAILED", message: "Rollback falhou." } };
      if (parsed.json) {
        console.log(JSON.stringify(err, null, 2));
      } else {
        console.error(err.error.message || JSON.stringify(err.error));
      }
      process.exitCode = 1;
      return;
    }
    const boRb = buildExecutionObservability({
      outputDirAbs,
      force: false,
      recordDiagnosticEvents: false,
    });
    if (!boRb.ok) {
      const err = { ok: false, error: boRb.error || { code: "OBSERVABILITY_FAILED", message: "Observability falhou." } };
      if (parsed.json) console.log(JSON.stringify(err, null, 2));
      else console.error(err.error.message || JSON.stringify(err.error));
      process.exitCode = 1;
      return;
    }
    const validation = validateExecutionRuntimeResult(outputDirAbs);
    if (!validation.ok) {
      const err = {
        ok: false,
        error: {
          code: "EXECUTE_VALIDATION_FAILED",
          message: validation.errors.join(" | "),
        },
      };
      if (parsed.json) {
        console.log(JSON.stringify(err, null, 2));
      } else {
        console.error(err.error.message);
      }
      process.exitCode = 1;
      return;
    }
    if (validation.warnings && validation.warnings.length && !parsed.json) {
      for (const w of validation.warnings) console.warn(w);
    }
    if (parsed.json) {
      console.log(
        JSON.stringify(
          {
            ok: true,
            runId,
            outputDir: outputDirAbs,
            rollback: true,
            subtask_id: rr.subtask_id,
            restored_files_total: rr.restored_files_total,
          },
          null,
          2,
        ),
      );
    } else {
      console.log(
        `Rollback concluído (subtask ${rr.subtask_id || "?"}, ficheiros restaurados: ${rr.restored_files_total ?? 0}).`,
      );
    }
    return;
  }

  const res = runExecutionRuntimeBase({
    outputDirAbs,
    runId,
    force: parsed.force,
    resume: parsed.resume,
  });

  if (!res.ok) {
    if (parsed.json) {
      console.log(JSON.stringify({ ok: false, error: res.error }, null, 2));
    } else {
      const msg =
        res.error && typeof res.error === "object" && res.error.message != null
          ? String(res.error.message)
          : JSON.stringify(res.error);
      console.error(msg);
    }
    process.exitCode = 1;
    return;
  }

  const validation = validateExecutionRuntimeResult(outputDirAbs);
  if (!validation.ok) {
    const err = {
      ok: false,
      error: {
        code: "EXECUTE_VALIDATION_FAILED",
        message: validation.errors.join(" | "),
      },
    };
    if (parsed.json) {
      console.log(JSON.stringify(err, null, 2));
    } else {
      console.error(err.error.message);
    }
    process.exitCode = 1;
    return;
  }
  if (validation.warnings && validation.warnings.length && !parsed.json) {
    for (const w of validation.warnings) console.warn(w);
  }

  if (parsed.json) {
    console.log(
      JSON.stringify(
        {
          ok: true,
          runId,
          outputDir: outputDirAbs,
          skipped: Boolean(res.skipped),
          artifacts: res.artifacts || [],
        },
        null,
        2,
      ),
    );
  } else if (res.skipped) {
    console.log(`Execution runtime já inicializado (skip): ${runId}`);
  } else {
    console.log(`Execution runtime inicializado: ${runId}`);
  }
}

main().catch((e) => {
  console.error(e && e.message ? e.message : e);
  process.exitCode = 1;
});
