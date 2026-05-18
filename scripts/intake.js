#!/usr/bin/env node

require("dotenv").config({ quiet: true });

const {
  executeIntake,
  parseIntakeCliArgs,
} = require("./runtime/intake/intake-runtime");
const {
  printIntakeHumanSummary,
  intakeResultToJson,
} = require("./runtime/intake/intake-cli-output");

const rawCliArgs = process.argv.slice(2);
const wantJson = rawCliArgs.includes("--json");

async function main() {
  const parsed = parseIntakeCliArgs(rawCliArgs);
  const projectArg = parsed.project != null ? String(parsed.project).trim() : "";
  const taskArg = parsed.task != null ? String(parsed.task).trim() : "";

  if (!projectArg || !taskArg) {
    if (parsed.json) {
      console.log(
        JSON.stringify(
          {
            ok: false,
            error: {
              code: "INTAKE_CLI_USAGE",
              message:
                "Uso: npm run intake -- --project <caminho> --task \"…\" [--skip-llm] [--json]",
            },
          },
          null,
          2,
        ),
      );
    } else {
      console.error(
        "Uso: npm run intake -- --project <caminho-do-projeto> --task \"texto livre\" | --task caminho/task.md [--skip-llm] [--json]",
      );
      console.error(
        "Ou: node scripts/intake.js --project <caminho> --task <texto|ficheiro> [--json]",
      );
    }
    process.exitCode = 1;
    return;
  }

  const res = await executeIntake({
    projectArg,
    taskArg,
    cwd: process.cwd(),
    skipLlm: Boolean(parsed.skipLlm),
  });

  if (!res.ok) {
    if (parsed.json) {
      console.log(JSON.stringify({ ok: false, error: res.error }, null, 2));
    } else {
      console.error(res.error.message || "intake falhou");
    }
    process.exitCode = 1;
    return;
  }

  if (parsed.json) {
    console.log(JSON.stringify(intakeResultToJson(res), null, 2));
  } else {
    printIntakeHumanSummary(res);
  }
  process.exitCode = 0;
}

main().catch((error) => {
  if (wantJson) {
    console.log(
      JSON.stringify(
        {
          ok: false,
          error: {
            code: "INTAKE_CLI_UNHANDLED",
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
  process.exit(1);
});
