#!/usr/bin/env node
require("dotenv").config();

const {
  executeReplayPipeline,
} = require("./runtime/run-runtime");

async function main() {
  const argv = process.argv.slice(2);
  const positional = argv.filter((a) => !a.startsWith("--"));
  const runIdArg = positional[0];
  let fromStep = "executor";
  const fromArg = argv.find((a) => a.startsWith("--from="));
  if (fromArg) {
    fromStep = String(fromArg.slice("--from=".length)).trim();
  }

  if (!runIdArg) {


    console.error(


      "Uso: node scripts/replay.js <runId|latest|idx> [--from=executor|review|correction]",
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



  const res = await executeReplayPipeline({


    outputDir,

    fromStep,

    initiatedBy: "replay_js",

    holderLabel: "setup_boss_replay_js",

  });

  process.exitCode = res.exitCode;
  if (res.success)


    console.log(`✅ Replay (--from=${fromStep}) concluído.`);

  else if (res.error && res.error.message)
    console.error(res.error.message);
}

main().catch((error) => {
  console.error("❌ Erro:", error.message || error);

  process.exit(1);


});
