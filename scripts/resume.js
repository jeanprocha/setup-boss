#!/usr/bin/env node
require("dotenv").config();

const { executeResumePipeline } = require("./runtime/run-runtime");

const {
  parseGovernanceCliFlags,
} = require("./cli/lib/governance-cli");

const raw = process.argv.slice(2);
const positional = raw.filter((a) => !a.startsWith("--"));
const runIdArg = positional[0];

async function main() {
  if (!runIdArg) {
    console.error(
      "Uso: node scripts/resume.js <runId|latest|idx> [--policy-profile=FAST|...] [--force-policy-bypass] [--disable-governance]",
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

  const gv = parseGovernanceCliFlags(raw);

  const { assessResume } = require("./runtime/replay/resume-engine");

  const assessment = assessResume(outputDir);

  if (!assessment.ok) {
    console.error(assessment.reason || "RUN_NOT_RESUMABLE");

    process.exitCode = 1;

    return;
  }

  const res = await executeResumePipeline({

    outputDir,

    nextPhase: assessment.next_phase,

    flowOptions: {

      policyProfile: gv.policyProfile,

      forcePolicyBypass: gv.forcePolicyBypass,

      disableGovernance: gv.disableGovernance,

    },

    initiatedBy: "resume_js",

    holderLabel: "setup_boss_resume_js",

  });

  process.exitCode = res.exitCode;
  if (!res.success && res.error && res.error.message) {
    console.error(res.error.message);
  }
}

main().catch((error) => {
  console.error("❌ Erro:", error.message || error);
  process.exit(1);
});
