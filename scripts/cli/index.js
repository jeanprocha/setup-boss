#!/usr/bin/env node

require("dotenv").config({ quiet: true });

const { runList } = require("./commands/list");
const { runStatus } = require("./commands/status");
const { runInspect } = require("./commands/inspect");
const { runDoctor } = require("./commands/doctor");

const {
  parseGovernanceCliFlags,
} = require("./lib/governance-cli");

function printUsage() {
  console.log(`Uso:
  npm run setup-boss -- list [--limit=N]
  npm run setup-boss -- status
  npm run setup-boss -- doctor [--json] [--runs-limit=N] [--strict-runs] [--project=<id|caminho>]
  npm run setup-boss -- projects [--json]
  npm run setup-boss -- retry <jobId> [--json]
  npm run setup-boss -- maintenance prune [--all] [--events] [--dry-run] [--json] [--force-events]
  npm run setup-boss -- inspect-transaction [runId | latest | índice] [--json] [--full-contract]
  npm run setup-boss -- inspect-plan [runId | latest | índice] [--json] [--include-plan] [--diff=caminho/plano.json] [--include-transaction]
  npm run setup-boss -- inspect-validation-targets [runId | latest | índice] [--json] [--sample=N]
  npm run setup-boss -- inspect-validation-runtime [runId | latest | índice] [--json] [--include-transaction]
  npm run setup-boss -- inspect-review [runId | latest | índice] [--json] [--compact] [--rerun-invariants] [--include-transaction] [--full-deterministic]
  npm run setup-boss -- inspect-review --diff <runA> <runB> [--json] [--write-diff] [--compact]
  npm run setup-boss -- inspect-risk-analysis [runId | latest | índice] [--json]
  npm run setup-boss -- inspect-correction [runId | latest | índice] [--json] [--include-transaction]
  npm run setup-boss -- semantic inspect [runId | latest | índice] [--json] [--no-write]
  npm run setup-boss -- plan-doctor [runId | latest | índice] [--json]
  npm run setup-boss -- governance inspect <runId | latest | índice> [--json] [--no-write]
  npm run setup-boss -- inspect <runId | latest | índice>
  npm run setup-boss -- inspect-run <runId>
  npm run setup-boss -- apply <runId> [--confirm] [--policy-profile=...] [--force-policy-bypass] [--disable-governance]
  npm run setup-boss -- replay <runId> [--from=executor|review|correction]
  npm run setup-boss -- resume <runId> [--policy-profile=FAST|NORMAL|STRICT|ENTERPRISE] [--force-policy-bypass] [--disable-governance]
  npm run setup-boss -- run <task.md> <projeto> [--dry-run] [--force-scan] [--yes|--no-confirm] [--policy-profile=FAST|NORMAL|STRICT|ENTERPRISE] [--force-policy-bypass] [--disable-governance]
  npm run setup-boss -- intake --project <projeto> --task "texto ou caminho" [--skip-llm] [--json]
  npm run setup-boss -- clarify --run <runId|caminho-output> [--skip-llm] [--answers <ficheiro>] [--answer id=valor]... [--overwrite] [--json]
  npm run setup-boss -- daemon start [--foreground] | stop | status
  npm run setup-boss -- enqueue <task.md> <projeto> [--dry-run] [--force-scan] [--yes|--no-confirm] [--policy-profile=...] [--force-policy-bypass] [--disable-governance]
  npm run setup-boss -- queue [--json] [--project=<id|caminho>]
  npm run setup-boss -- watch <jobId> [--limit=N]

Variável opcional: SETUP_BOSS_CLI_ROOT=caminho/repositório-setup-boss
`);
}

function repoRootFromEnv() {
  const raw = process.env.SETUP_BOSS_CLI_ROOT;
  if (!raw || !String(raw).trim()) return null;
  return String(raw).trim();
}

async function main() {
  const argv = process.argv.slice(2);
  const root = repoRootFromEnv();

  if (argv.length === 0) {
    printUsage();
    process.exitCode = 1;
    return;
  }

  const cmd = argv[0];
  const rest = argv.slice(1);

  if (cmd === "projects") {
    const { runProjects } = require("./commands/projects");
    await runProjects(rest);
    return;
  }

  if (cmd === "daemon") {
    const { runDaemonCmd } = require("./commands/daemon");
    await runDaemonCmd(rest);
    return;
  }

  if (cmd === "enqueue") {
    const { runEnqueue } = require("./commands/enqueue");

    await runEnqueue(rest);


    return;
  }

  if (cmd === "queue") {
    const { runQueue } = require("./commands/queue");

    await runQueue(rest);


    return;


  }



  if (cmd === "watch") {
    const { runWatch } = require("./commands/watch");

    await runWatch(rest);

    return;
  }

  if (cmd === "retry") {
    const { runRetry } = require("./commands/retry");
    await runRetry(rest);
    return;
  }

  if (cmd === "maintenance") {
    const { runMaintenance } = require("./commands/maintenance");
    await runMaintenance(rest);
    return;
  }

  if (cmd === "list") {
    runList(rest, { repoRoot: root });
    return;
  }

  if (cmd === "status") {
    runStatus({ repoRoot: root });
    return;
  }

  if (cmd === "doctor") {
    runDoctor(rest, { repoRoot: root });
    return;
  }

  if (cmd === "inspect-plan") {
    const { runInspectPlan } = require("./commands/inspect-plan");
    await Promise.resolve();
    runInspectPlan(rest, { repoRoot: root });
    return;
  }

  if (cmd === "inspect-validation-targets") {
    const { runInspectValidationTargets } = require("./commands/inspect-validation-targets");
    await Promise.resolve();
    runInspectValidationTargets(rest, { repoRoot: root });
    return;
  }

  if (cmd === "inspect-validation-runtime") {
    const { runInspectValidationRuntime } = require("./commands/inspect-validation-runtime");
    await Promise.resolve();
    runInspectValidationRuntime(rest, { repoRoot: root });
    return;
  }

  if (cmd === "inspect-review") {
    const { runInspectReview } = require("./commands/inspect-review");
    await Promise.resolve();
    runInspectReview(rest, { repoRoot: root });
    return;
  }

  if (cmd === "inspect-risk-analysis") {
    const { runInspectRiskAnalysis } = require("./commands/inspect-risk-analysis");
    await Promise.resolve();
    runInspectRiskAnalysis(rest, { repoRoot: root });
    return;
  }

  if (cmd === "inspect-correction") {
    const { runInspectCorrection } = require("./commands/inspect-correction");
    await Promise.resolve();
    runInspectCorrection(rest, { repoRoot: root });
    return;
  }

  if (cmd === "semantic") {
    const sub = rest[0];
    const tail = rest.slice(1);
    if (sub === "inspect") {
      const { runSemanticInspect } = require("./commands/semantic-inspect");
      runSemanticInspect(tail, { repoRoot: root });
      return;
    }
    console.error('Subcomando semantic inválido. Use: semantic inspect [runId | latest | índice] [--json] [--no-write]');
    process.exitCode = 1;
    return;
  }

  if (cmd === "inspect-transaction") {
    const { runInspectTransaction } = require("./commands/inspect-transaction");
    await Promise.resolve();
    runInspectTransaction(rest, { repoRoot: root });
    return;
  }

  if (cmd === "plan-doctor") {
    const { runPlanDoctor } = require("./commands/plan-doctor");
    await Promise.resolve();
    runPlanDoctor(rest, { repoRoot: root });
    return;
  }

  if (cmd === "governance") {
    const sub = rest[0];
    const tail = rest.slice(1);
    if (sub === "inspect") {
      const { runGovernanceInspect } = require("./commands/governance-inspect");
      runGovernanceInspect(tail, { repoRoot: root });
      return;
    }
    console.error('Subcomando governance inválido. Use: governance inspect <runId | latest | índice>');
    process.exitCode = 1;
    return;
  }

  if (cmd === "inspect-run") {
    const { runInspectRun } = require("./commands/inspect-run");
    runInspectRun(rest, { repoRoot: root });
    return;
  }

  if (cmd === "inspect") {
    if (!rest.length) {
      console.error("Falta argumento: run id, latest ou índice.");
      process.exitCode = 1;
      return;
    }
    runInspect(rest, { repoRoot: root });
    return;
  }

  if (cmd === "apply") {
    const runIdArg = rest.filter((a) => !a.startsWith("--"))[0];
    const confirm =
      rest.includes("--confirm") ||
      process.env.SETUP_BOSS_APPLY_CONFIRM === "1";

    if (!runIdArg) {
      console.error(
        "Uso: setup-boss apply <runId> [--confirm] [--policy-profile=...] [--force-policy-bypass] [--disable-governance]",
      );
      process.exitCode = 1;
      return;
    }

    let outputDir;
    try {
      const { resolveOutputDir } = require("../../core/run-resolver");
      outputDir = resolveOutputDir(runIdArg);
    } catch (e) {
      console.error(e.message || e);
      process.exitCode = 1;
      return;
    }

    const gv = parseGovernanceCliFlags(rest);
    const { executeDeterministicApplyPipeline } = require("../runtime/run-runtime");
    const res = await executeDeterministicApplyPipeline({
      outputDir,
      confirm,
      forcePolicyBypass: gv.forcePolicyBypass,
      disableGovernance: gv.disableGovernance,
      policyProfileCli: gv.policyProfile,
      initiatedBy: "setup_boss_cli",
      holderLabel: "setup_boss_cli_apply",
    });

    process.exitCode = res.exitCode;
    if (res.success) {
      console.log("✅ Apply determinístico concluído (sem LLM).");
    } else if (res.error && res.error.message) {
      console.error(res.error.message);
    }

    return;
  }

  if (cmd === "replay") {
    const positional = rest.filter((a) => !a.startsWith("--"));
    const runIdArg = positional[0];
    let fromStep = "executor";
    const fromArg = rest.find((a) => a.startsWith("--from="));
    if (fromArg) {
      fromStep = String(fromArg.slice("--from=".length)).trim();
    }

    if (!runIdArg) {
      console.error(
        "Uso: setup-boss replay <runId> [--from=executor|review|correction]",
      );
      process.exitCode = 1;
      return;
    }

    let outputDir;
    try {
      const { resolveOutputDir } = require("../../core/run-resolver");
      outputDir = resolveOutputDir(runIdArg);
    } catch (e) {
      console.error(e.message || e);
      process.exitCode = 1;
      return;
    }

    const { executeReplayPipeline } = require("../runtime/run-runtime");
    const res = await executeReplayPipeline({
      outputDir,
      fromStep,
      initiatedBy: "setup_boss_cli",
      holderLabel: "setup_boss_cli_replay",
    });

    process.exitCode = res.exitCode;
    if (res.success) {
      console.log(`✅ Replay (--from=${fromStep}) concluído.`);
    } else if (res.error && res.error.message) {
      console.error(res.error.message);
    }

    return;
  }

  if (cmd === "resume") {
    const runIdArg = rest.filter((a) => !a.startsWith("--"))[0];

    if (!runIdArg) {
      console.error(
        "Uso: setup-boss resume <runId> [--policy-profile=...] [--force-policy-bypass] [--disable-governance]",
      );
      process.exitCode = 1;
      return;
    }

    let outputDir;
    try {
      const { resolveOutputDir } = require("../../core/run-resolver");
      outputDir = resolveOutputDir(runIdArg);
    } catch (e) {
      console.error(e.message || e);
      process.exitCode = 1;
      return;
    }

    const gv = parseGovernanceCliFlags(rest);
    const { assessResume } = require("../runtime/replay/resume-engine");
    const assessment = assessResume(outputDir);

    if (!assessment.ok) {
      console.error(assessment.reason || "RUN_NOT_RESUMABLE");
      process.exitCode = 1;
      return;
    }

    const { executeResumePipeline } = require("../runtime/run-runtime");
    const res = await executeResumePipeline({
      outputDir,
      nextPhase: assessment.next_phase,
      flowOptions: {
        policyProfile: gv.policyProfile,
        forcePolicyBypass: gv.forcePolicyBypass,
        disableGovernance: gv.disableGovernance,
      },
      initiatedBy: "setup_boss_cli",
      holderLabel: "setup_boss_cli_resume",
    });

    process.exitCode = res.exitCode;
    if (!res.success) {
      const msg = res.error && res.error.message ? res.error.message : "";
      const code = res.error && res.error.code ? res.error.code : "";
      if (code === "PROJECT_LOCKED" || res.status === "blocked") {
        console.error(
          `Projeto bloqueado (${msg}). Espera até outro comando/daemon libertar ou verifica locks em .setup-boss/locks.`,
        );
      } else if (msg) {
        console.error(msg);
      }
    }

    return;
  }

  if (cmd === "clarify") {
    const { runClarify } = require("./commands/clarify");
    await runClarify(rest);
    return;
  }

  if (cmd === "intake") {
    const { executeIntake, parseIntakeCliArgs } = require("../runtime/intake/intake-runtime");
    const {
      printIntakeHumanSummary,
      intakeResultToJson,
    } = require("../runtime/intake/intake-cli-output");
    const parsed = parseIntakeCliArgs(rest);
    const projectArg =
      parsed.project != null ? String(parsed.project).trim() : "";
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
                  "Uso: setup-boss intake --project <caminho> --task \"texto\"|--task <ficheiro.md> [--skip-llm] [--json]",
              },
            },
            null,
            2,
          ),
        );
      } else {
        console.error(
          "Uso: setup-boss intake --project <caminho> --task \"texto\"|--task <ficheiro.md> [--skip-llm] [--json]",
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
    return;
  }

  if (cmd === "run") {
    const { executeRunPipeline } = require("../runtime/run-runtime");
    const FORCE_SCAN_FLAG = "--force-scan";
    const DRY_RUN_FLAG = "--dry-run";
    const SKIP_PREFLIGHT_CONFIRM_FLAGS = new Set(["--yes", "--no-confirm"]);
    const gv = parseGovernanceCliFlags(rest);
    const forceScan =
      rest.includes(FORCE_SCAN_FLAG) ||
      process.env.FORCE_SCAN === "1" ||
      /^true$/i.test(String(process.env.FORCE_SCAN || ""));
    const dryRun =
      rest.includes(DRY_RUN_FLAG) ||
      process.env.SETUP_BOSS_DRY_RUN === "1" ||
      /^true$/i.test(String(process.env.SETUP_BOSS_DRY_RUN || ""));
    const skipPreflightConfirm = rest.some((a) =>
      SKIP_PREFLIGHT_CONFIRM_FLAGS.has(a),
    );
    const args = rest.filter(
      (a) =>
        a !== FORCE_SCAN_FLAG &&
        a !== DRY_RUN_FLAG &&
        !SKIP_PREFLIGHT_CONFIRM_FLAGS.has(a) &&
        !/^--policy-profile=/i.test(a) &&
        a !== "--force-policy-bypass" &&
        a !== "--disable-governance",
    );
    if (!args[0] || !args[1]) {
      console.error(
        "Uso: setup-boss run <task.md> <projeto> [--dry-run] [--force-scan] [--yes|--no-confirm] [--policy-profile=...] [--force-policy-bypass] [--disable-governance]",
      );
      process.exitCode = 1;
      return;
    }

    const res = await executeRunPipeline({
      taskArg: args[0],
      projectArg: args[1],
      flowOptions: {
        forceScan,
        dryRun,
        skipPreflightConfirm,
        policyProfile: gv.policyProfile,
        forcePolicyBypass: gv.forcePolicyBypass,
        disableGovernance: gv.disableGovernance,
      },
      initiatedBy: "setup_boss_cli",
      holderLabel: "setup_boss_cli_run",
    });

    process.exitCode = res.exitCode;
    if (!res.success) {
      const msg = res.error && res.error.message ? res.error.message : "";
      const code = res.error && res.error.code ? res.error.code : "";
      if (code === "PROJECT_LOCKED" || res.status === "blocked") {
        console.error(
          `Projeto bloqueado (${msg}). Se o daemon está a correr, aguarde a fila; sincronização manual exige projeto livre.`,
        );
      } else if (msg) {
        console.error(msg);
      }
    }

    return;
  }

  printUsage();
  process.exitCode = 1;
}

main().catch((error) => {
  console.error("❌ Erro:", error.message || error);
  process.exit(1);
});
