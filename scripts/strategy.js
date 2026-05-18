#!/usr/bin/env node

require("dotenv").config({ quiet: true });

const path = require("path");
const { resolveOutputDir } = require("../core/run-resolver");
const { runStrategyRuntimeBase } = require("./runtime/strategy-runtime/run-strategy-runtime");

const rawCliArgs = process.argv.slice(2);
const wantJson = rawCliArgs.includes("--json");

/**
 * @param {string[]} argv
 * @returns {{ run: string|null, json: boolean, force: boolean }}
 */
function parseStrategyCliArgs(argv) {
  const opts = { run: null, json: false, force: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--json") {
      opts.json = true;
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
  const parsed = parseStrategyCliArgs(rawCliArgs);
  const runArg = parsed.run != null ? String(parsed.run).trim() : "";

  if (!runArg) {
    const err = {
      ok: false,
      error: {
        code: "STRATEGY_CLI_USAGE",
        message:
          "Uso: npm run strategy -- --run <runId|pasta-output> [--force] [--json]",
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

  let outputDir;
  try {
    outputDir = resolveOutputDir(runArg);
  } catch (e) {
    const msg = e && /** @type {Error} */ (e).message ? String(/** @type {Error} */ (e).message) : String(e);
    const err = {
      ok: false,
      error: { code: "STRATEGY_RESOLVE_FAILED", message: msg },
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

  const res = runStrategyRuntimeBase({
    outputDirAbs,
    runId,
    force: parsed.force,
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
    console.log(`Strategy runtime já concluído (skip): ${runId}`);
  } else {
    console.log(`OK: strategy runtime — ${runId}`);
  }
}

main().catch((error) => {
  if (wantJson) {
    console.log(
      JSON.stringify(
        {
          ok: false,
          error: {
            code: "STRATEGY_CLI_UNHANDLED",
            message: error.message || String(error),
          },
        },
        null,
        2,
      ),
    );
  } else {
    console.error("❌ Erro:", error.message || error);
  }
  process.exitCode = 1;
});

module.exports = { parseStrategyCliArgs };
