#!/usr/bin/env node
require("dotenv").config();

const {
  executeDeterministicApplyPipeline,
} = require("./runtime/run-runtime");

const {
  parseGovernanceCliFlags,
} = require("./cli/lib/governance-cli");

async function main() {
  const argv = process.argv.slice(2);
  const gv = parseGovernanceCliFlags(argv);
  const positional = argv.filter((a) => !a.startsWith("--"));
  const runIdArg = positional[0];
  const confirm =
    argv.includes("--confirm") || process.env.SETUP_BOSS_APPLY_CONFIRM === "1";

  if (!runIdArg) {
    console.error(
      "Uso: node scripts/apply.js <runId|latest|idx> [--confirm] [--policy-profile=...] [--force-policy-bypass] [--disable-governance]",
    );

    process.exitCode = 1;

    return;
  }

  const { resolveOutputDir } = require("../core/run-resolver");

  let outputDir;

  try {
    outputDir = resolveOutputDir(runIdArg);

  }

  catch (e) {


    console.error(e.message || e);


    process.exitCode = 1;


    return;

  }


  const res = await executeDeterministicApplyPipeline({


    outputDir,


    confirm,


    forcePolicyBypass: gv.forcePolicyBypass,


    disableGovernance: gv.disableGovernance,


    policyProfileCli: gv.policyProfile,


    initiatedBy: "apply_js",

    holderLabel: "setup_boss_apply_js",

  });

  process.exitCode = res.exitCode;
  if (res.success)
    console.log("✅ Apply determinístico concluído (sem LLM).");

  else if (res.error && res.error.message)
    console.error(res.error.message);
}

main().catch((error) => {
  console.error("❌ Erro:", error.message || error);
  process.exit(1);
});
