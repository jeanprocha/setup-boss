require("dotenv").config();

const { executeRunPipeline } = require("./runtime/run-runtime");

const FORCE_SCAN_FLAG = "--force-scan";
const DRY_RUN_FLAG = "--dry-run";
const SKIP_PREFLIGHT_CONFIRM_FLAGS = new Set(["--yes", "--no-confirm"]);

const rawCliArgs = process.argv.slice(2);
const forceScan =
  rawCliArgs.includes(FORCE_SCAN_FLAG) ||
  process.env.FORCE_SCAN === "1" ||
  /^true$/i.test(String(process.env.FORCE_SCAN || ""));
const dryRun =
  rawCliArgs.includes(DRY_RUN_FLAG) ||
  process.env.SETUP_BOSS_DRY_RUN === "1" ||
  /^true$/i.test(String(process.env.SETUP_BOSS_DRY_RUN || ""));
const skipPreflightConfirm = rawCliArgs.some((a) =>
  SKIP_PREFLIGHT_CONFIRM_FLAGS.has(a),
);

const forcePolicyBypass = rawCliArgs.includes("--force-policy-bypass");
const disableGovernance = rawCliArgs.includes("--disable-governance");
const policyProfileArg = rawCliArgs.find((a) =>
  /^--policy-profile=/i.test(a),
);
const policyProfile =
  policyProfileArg && policyProfileArg.includes("=")
    ? String(policyProfileArg.replace(/^[^=]+=/i, "")).trim() || null
    : null;

const args = rawCliArgs.filter(
  (a) =>
    a !== FORCE_SCAN_FLAG &&
    a !== DRY_RUN_FLAG &&
    !SKIP_PREFLIGHT_CONFIRM_FLAGS.has(a) &&
    !/^--policy-profile=/i.test(a) &&
    a !== "--force-policy-bypass" &&
    a !== "--disable-governance",
);

const ROOT_DIR = require("path").resolve(__dirname, "..");

console.log("[RUN] args:", rawCliArgs);
console.log("[RUN] ROOT_DIR:", ROOT_DIR);
console.log("[RUN] forceScan (--force-scan ou FORCE_SCAN=1|true):", forceScan);
console.log(
  "[RUN] dryRun (--dry-run ou SETUP_BOSS_DRY_RUN=1|true):",
  dryRun,
);

async function main() {
  /** Modo de integração E2E/CI: termina sem pipeline LLM (só quando definido no processo). */
  if (process.env.SETUP_BOSS_E2E_WORKER_NOOP === "1") {
    const sleepMs = Math.max(0, Math.floor(Number(process.env.SETUP_BOSS_E2E_WORKER_SLEEP_MS || "0")));
    if (sleepMs > 0) await new Promise((r) => setTimeout(r, sleepMs));

    const codeRaw = Number(process.env.SETUP_BOSS_E2E_WORKER_EXIT_CODE ?? "0");
    const code = Number.isFinite(codeRaw) ? codeRaw : 1;

    console.log("[RUN] runId: e2e-noop-run");

    process.exitCode = code;

    return;
  }

  const res = await executeRunPipeline({
    taskArg: args[0],
    projectArg: args[1],
    flowOptions: {
      forceScan,
      dryRun,
      skipPreflightConfirm,
      policyProfile,
      forcePolicyBypass,
      disableGovernance,
    },
    initiatedBy: "run_js",
    holderLabel: "setup_boss_run_js",
  });

  process.exitCode = res.exitCode;
}

main().catch((error) => {
  console.error("❌ Erro:", error.message || error);
  process.exitCode = process.exitCode || 1;
  process.exit(1);
});
