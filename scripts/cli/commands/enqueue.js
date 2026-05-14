const path = require("path");
const fs = require("fs");
const { getSetupBossRepoRoot } = require("../../daemon/lib/repo-root");
const { enqueueJob } = require("../../daemon/lib/queue-store");

const FORCE_SCAN_FLAG = "--force-scan";
const DRY_RUN_FLAG = "--dry-run";
const SKIP_PREFLIGHT_CONFIRM_FLAGS = new Set(["--yes", "--no-confirm"]);
const {
  parseGovernanceCliFlags,
} = require("../lib/governance-cli");

/** @param {string[]} rest */
async function runEnqueue(rest) {


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


      "Uso: setup-boss enqueue <task.md> <projeto> [--dry-run] [--force-scan] [--yes|--no-confirm] [--policy-profile=...] [--force-policy-bypass] [--disable-governance]",
    );


    process.exitCode = 1;


    return;


  }



  const taskArg = args[0];


  const projectArg = args[1];


  const repoRoot = getSetupBossRepoRoot();


  const taskPathPre = path.resolve(repoRoot, taskArg);


  if (!fs.existsSync(taskPathPre)) {


    console.error(`Task não encontrada: ${taskPathPre}`);


    process.exitCode = 1;


    return;


  }


  const projectRoot = path.resolve(repoRoot, projectArg);

  const flowOptions = {
    dryRun,
    forceScan,
    skipPreflightConfirm,
    policyProfile: gv.policyProfile,
    forcePolicyBypass: gv.forcePolicyBypass,
    disableGovernance: gv.disableGovernance,
  };

  try {
    const {
      isRuntimeApiAvailable,
      postEnqueueViaApi,
    } = require("../lib/runtime-api-client");

    if (await isRuntimeApiAvailable()) {
      const resp = await postEnqueueViaApi({
        taskPath: taskArg,
        projectPath: projectArg,
        flowOptions,
        metadata: { cli: "enqueue", source: "cli_enqueue" },
      });

      if (
        resp.status === 201 &&
        resp.json &&
        resp.json.ok &&
        resp.json.jobId
      ) {
        console.log(
          JSON.stringify({
            ok: true,
            channel: "runtime_api",
            jobId: resp.json.jobId,
            status: "pending",
          }),
        );

        return;
      }

      console.error(
        `[enqueue] Runtime API (${resp.status}); fallback filesystem.`,
      );

    }

  } catch (_) {

    /* falha rede — filesystem */



  }



  const job = enqueueJob({
    projectRoot,

    taskArg,

    projectArg,

    flowOptions,

    metadata: {
      cli: "enqueue",

    },

  });



  console.log(JSON.stringify({


    ok: true,



    channel: "filesystem",

    jobId: job.id,

    status: job.status,

    createdAt: job.createdAt,

  }));
}

module.exports = {
  runEnqueue,

};
