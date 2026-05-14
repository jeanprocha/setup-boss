/**
 * Adaptador único entre entrypoints (CLI, daemon eventual in-process, API futura)
 * e o núcleo de orchestration/replay/apply.
 *
 * Contrato: resultado serializável; sem process.exit; lock de projeto opcional aqui.
 */

const path = require("path");
const { REPO_ROOT } = require("./runtime-context");
const { RuntimeTerminalError } = require("./runtime-errors");
const {
  runWithProjectLock,

} = require("../daemon/lib/project-lock");

/** @typedef {import("./runtime-errors").RuntimeTerminalError} RuntimeTerminalErrorT */

function envSkipLock() {

  const v = process.env.SETUP_BOSS_SKIP_PROJECT_LOCK;
  return v === "1" || /^true$/i.test(String(v || ""));

}


function daemonChildSkipLock() {
  /* Filho spawned pelo daemon já corre sob lock na posse do pai. */


  const id = process.env.SETUP_BOSS_DAEMON_JOB_ID;
  return id != null && String(id).trim() !== "";

}



/**
 * Ambiente combinado onde o lock deve ser omitido (evitar deadlock / lock duplo).
 */


function skipProjectLockByEnv() {
  return envSkipLock() || daemonChildSkipLock();

}



function isoNow() {
  return new Date().toISOString();
}



function emptyFlowMetadata() {


  return {

    governance: null,

    reviewStatus: null,

    correctionLoops: null,

    artifactsDigest: null,

  };

}



/**


 * @param {object} input


 */


function serializeError(error) {


  if (!error || typeof error !== "object")


    return { code: "ERROR", message: String(error ?? "") };


  const e = /** @type {RuntimeTerminalErrorT & Error} */ (error);


  return {

    code: typeof e.code === "string" ? e.code : "ERROR",

    message: String(e.message || error),

    stack: typeof e.stack === "string" ? e.stack.slice(0, 4000) : undefined,

  };

}



/**


 * @param {{
 * success: boolean,
 * runId: string|null,
 * outputDir: string|null,
 * status: string,
 * exitCode: number,
 * startedAt: string,
 * finishedAt: string,
 * error: ReturnType<typeof serializeError>|null,
 * metadata: object,
 * flow?: Record<string, unknown>,
 * }} p


 */


function buildResult(p) {


  return {

    success: p.success,

    runId: p.runId,

    outputDir: p.outputDir,

    status: p.status,

    exitCode: p.exitCode,

    startedAt: p.startedAt,

    finishedAt: p.finishedAt,

    error: p.error,

    artifacts: null,

    governance: p.flow?.governance ?? null,

    reviewStatus: p.flow?.reviewStatus ?? null,

    correctionLoops:

      typeof p.flow?.correctionLoops === "number"


        ? p.flow.correctionLoops


        : p.flow?.correctionLoops ?? null,

    metadata: p.metadata || {},

  };

}
async function _runPipelineUnlocked(opts) {
  const { emitBridge } = require("./runtime-event-bridge");

  const { taskArg, projectArg, flowOptions = {} } = opts;

  const { startFlow } = require("./orchestration");

  let outcome;
  try {
    outcome = await startFlow(taskArg, projectArg, flowOptions);


  } catch (e) {
    emitBridge("runtime_finished", {
      jobId: process.env.SETUP_BOSS_DAEMON_JOB_ID || null,
      runId: null,

      data: {


        crashed: true,






        message: String((e && e.message) || e || "").slice(0, 512),





      },





    });





    throw e;


  }



  const ok =
    outcome &&
    typeof outcome === "object" &&
    "exitCode" in outcome &&
    typeof outcome.exitCode === "number";


  emitBridge("runtime_finished", {
    jobId: process.env.SETUP_BOSS_DAEMON_JOB_ID || null,
    runId: outcome && outcome.runId ? outcome.runId : null,
    data: {
      adapterOk: ok,
      exitCode: ok ? outcome.exitCode : null,
      status: outcome && outcome.status ? outcome.status : null,
    },

  });


  if (ok) return outcome;

  throw new Error(
    "startFlow deve devolver objeto de resultado (adapter desalinhado com orchestration).",

  );


}

async function _resumeUnlocked(opts) {


  const { outputDir, nextPhase, flowOptions } = opts;


  const { startFlowResume } = require("./orchestration");


  const outcome = await startFlowResume(


    outputDir,


    nextPhase,


    flowOptions || {},

  );


  if (


    outcome &&


    typeof outcome === "object" &&


    "exitCode" in outcome &&


    typeof outcome.exitCode === "number"


  )


    return outcome;

  throw new Error(
    "startFlowResume deve devolver objeto de resultado (adapter desalinhado).",
  );

}



/**


 * Pipeline completa task → projeto (equiv. `run.js`).
 * @param {{
 * taskArg: string,
 * projectArg: string,
 * flowOptions?: object,
 * initiatedBy?: string,
 * skipProjectLock?: boolean,
 * jobId?: string,
 * holderLabel?: string,
 * }} opts


 */


async function executeRunPipeline(opts) {


  const startedAt = isoNow();


  const initiatedBy = opts.initiatedBy || "runtime";


  const repoRootForResolve = REPO_ROOT;


  const projectRoot = path.resolve(repoRootForResolve, opts.projectArg);


  const skipLock =


    opts.skipProjectLock === true || skipProjectLockByEnv();


  const holder = {


    pid: process.pid,


    jobId:


      opts.jobId || `${initiatedBy}_run_${Date.now().toString(36)}_${process.pid}`,


    label: opts.holderLabel || `setup_boss_${initiatedBy}_run`,

  };



  const flowExtras = {


    ...(opts.flowOptions && typeof opts.flowOptions === "object"


      ? opts.flowOptions


      : {}),

  };



  try {
    let outcome;



    const runInner = async () =>


      _runPipelineUnlocked({


        taskArg: opts.taskArg,


        projectArg: opts.projectArg,


        flowOptions: flowExtras,

      });


    if (skipLock) outcome = await runInner();


    else {


      outcome = await runWithProjectLock(projectRoot, holder, runInner);

    }

    try {
      const { tryWriteShadowExecutionGraphArtifacts } = require("./graph");
      tryWriteShadowExecutionGraphArtifacts({
        outputDir: outcome && outcome.outputDir,
        runId: outcome && outcome.runId,
        pipelineStatus: outcome && outcome.status,
        correctionIterations: outcome && outcome.correctionIterations,
        source: "executeRunPipeline",
      });
    } catch {
      /* overlay shadow — nunca interfere */
    }


    const finishedAt = isoNow();
    const success = outcome.exitCode === 0;
    let statusLabel = outcome.status;
    if (!success) statusLabel = "failed";

    else if (statusLabel === "blocked") statusLabel = "blocked";

    else if (statusLabel !== "completed") statusLabel = "partial";

    return buildResult({
      success,
      runId: outcome.runId ?? null,

      outputDir: outcome.outputDir ?? null,

      status: statusLabel,

      exitCode: outcome.exitCode,

      startedAt,

      finishedAt,

      error: null,

      metadata: {

        initiatedBy,

        pipelineStatusDetail: outcome.status,

        flowOptionsSnapshot: flowExtras,

        reason: outcome.reason ?? null,

      },

      flow: {

        correctionLoops: outcome.correctionIterations ?? null,

      },

    });

  } catch (e) {


    const ec =


      e && typeof e.exitCode === "number"


        ? e.exitCode


        : e instanceof RuntimeTerminalError


          ? e.exitCode


          : 1;



    const finishedAt = isoNow();


    let status = "failed";


    if ((e && typeof e.code === "string" && e.code === "PROJECT_LOCKED")


      || msgHasLock(e))


      status = "blocked";



    return buildResult({


      success: false,

      runId: null,

      outputDir: null,

      status,

      exitCode: ec,

      startedAt,

      finishedAt,

      error: serializeError(e),

      metadata: {


        initiatedBy,

        blocked: status === "blocked",

      },

      flow: emptyFlowMetadata(),

    });

  }

}



/**


 */


function msgHasLock(e) {
  const msg = String((e && e.message) || e || "");



  return /lock_held|LOCK_NOT_AVAILABLE|PROJECT_LOCKED/i.test(msg);

}



async function executeResumePipeline(opts) {
  const startedAt = isoNow();
  const initiatedBy = opts.initiatedBy || "runtime";
  const fs = require("fs");

  try {
    const metaPath = path.join(opts.outputDir, "metadata.json");
    let projectRoot = opts.projectRoot || null;

    if (!projectRoot) {
      if (!fs.existsSync(metaPath)) {
        throw new RuntimeTerminalError("metadata.json ausente.", {
          code: "METADATA_MISSING",
          exitCode: 1,
        });
      }

      try {
        const meta = JSON.parse(fs.readFileSync(metaPath, "utf-8"));
        projectRoot = meta.projectRoot;
        if (!projectRoot || typeof projectRoot !== "string") {
          throw new Error("metadata.projectRoot obrigatório");
        }

      } catch (e) {
        throw new RuntimeTerminalError(String(e.message || e), {
          code: "METADATA_INVALID",
          exitCode: 1,
        });
      }
    }

    projectRoot = path.normalize(path.resolve(String(projectRoot)));

    const skipLock =
      opts.skipProjectLock === true || skipProjectLockByEnv();

    const holder = {

      pid: process.pid,

      jobId:

        opts.jobId || `${initiatedBy}_resume_${Date.now().toString(36)}_${process.pid}`,

      label: opts.holderLabel || `setup_boss_${initiatedBy}_resume`,

    };

    let outcome;

    const inner = async () =>
      _resumeUnlocked({
        outputDir: opts.outputDir,

        nextPhase: opts.nextPhase,

        flowOptions: opts.flowOptions || {},

      });

    if (skipLock) outcome = await inner();
    else outcome = await runWithProjectLock(projectRoot, holder, inner);

    try {
      const { tryWriteShadowExecutionGraphArtifacts } = require("./graph");
      tryWriteShadowExecutionGraphArtifacts({
        outputDir: outcome && outcome.outputDir,
        runId: outcome && outcome.runId,
        pipelineStatus: outcome && outcome.status,
        correctionIterations: outcome && outcome.correctionIterations,
        source: "executeResumePipeline",
      });
    } catch {
      /* overlay shadow — nunca interfere */
    }

    const finishedAt = isoNow();
    const success = outcome.exitCode === 0;
    let statusLabel = outcome.status;
    if (!success) statusLabel = "failed";

    else if (statusLabel === "blocked") statusLabel = "blocked";

    else if (statusLabel !== "completed") statusLabel = "partial";


    return buildResult({

      success,

      runId: outcome.runId ?? null,

      outputDir: outcome.outputDir ?? path.resolve(opts.outputDir),

      status: statusLabel,

      exitCode: outcome.exitCode,

      startedAt,

      finishedAt,

      error: null,

      metadata: {

        initiatedBy,

        pipelineStatusDetail: outcome.status,

        nextPhase: opts.nextPhase,

        reason: outcome.reason ?? null,

      },

      flow: {

        correctionLoops: outcome.correctionIterations ?? null,

      },

    });

  } catch (e) {


    const ec =


      e && typeof e.exitCode === "number"


        ? e.exitCode


        : e instanceof RuntimeTerminalError


          ? e.exitCode


          : 1;



    const finishedAt = isoNow();


    let status = "failed";


    if ((e && typeof e.code === "string" && e.code === "PROJECT_LOCKED")


      || msgHasLock(e))


      status = "blocked";



    return buildResult({


      success: false,

      runId: path.basename(opts.outputDir),

      outputDir: path.resolve(opts.outputDir),

      status,

      exitCode: ec,

      startedAt,

      finishedAt,

      error: serializeError(e),

      metadata: { initiatedBy },


      flow: emptyFlowMetadata(),

    });

  }

}



/**


 */


async function executeDeterministicApplyPipeline(opts) {


  const startedAt = isoNow();


  const initiatedBy = opts.initiatedBy || "runtime";


  const { runDeterministicApply } = require("./replay/apply-later");


  const holder = {


    pid: process.pid,


    jobId:


      opts.jobId || `${initiatedBy}_apply_${Date.now().toString(36)}_${process.pid}`,


    label: opts.holderLabel || `setup_boss_${initiatedBy}_apply`,

  };



  try {


    const fs = require("fs");


    const metaPath = path.join(opts.outputDir, "metadata.json");


    if (!fs.existsSync(metaPath)) {


      throw new RuntimeTerminalError("metadata.json ausente.", {


        code: "METADATA_MISSING",


        exitCode: 1,

      });

    }



    const meta = JSON.parse(fs.readFileSync(metaPath, "utf-8"));


    const projectRoot = meta.projectRoot;


    if (!projectRoot || typeof projectRoot !== "string")


      throw new RuntimeTerminalError("projectRoot inválido em metadata.json.", {


        code: "PROJECT_ROOT_INVALID",


        exitCode: 1,

      });



    const rootAbs = path.normalize(path.resolve(String(projectRoot)));



    const skipLock =


      opts.skipProjectLock === true || skipProjectLockByEnv();



    let applyReport;



    const inner = async () => {


      applyReport = runDeterministicApply({


        outputDir: opts.outputDir,


        confirm: opts.confirm === true,


        forcePolicyBypass: opts.forcePolicyBypass === true,


        policyProfileCli: opts.policyProfileCli ?? null,


        disableGovernance: opts.disableGovernance === true,

      });


      return applyReport;

    };



    if (skipLock) await inner();


    else await runWithProjectLock(rootAbs, holder, inner);



    const finishedAt = isoNow();


    const runId = path.basename(path.resolve(opts.outputDir));



    return buildResult({


      success: true,

      runId,

      outputDir: path.resolve(opts.outputDir),

      status: "completed",

      exitCode: 0,

      startedAt,

      finishedAt,

      error: null,

      metadata: {


        initiatedBy,


        apply: applyReport || null,

      },

      flow: emptyFlowMetadata(),

    });

  } catch (e) {


    const ec =


      e && typeof e.exitCode === "number"


        ? e.exitCode


        : e instanceof RuntimeTerminalError


          ? e.exitCode


          : 1;



    const finishedAt = isoNow();


    let status = "failed";


    if ((e && typeof e.code === "string" && e.code === "PROJECT_LOCKED")


      || msgHasLock(e))


      status = "blocked";



    return buildResult({


      success: false,

      runId: path.basename(path.resolve(opts.outputDir)),

      outputDir: path.resolve(opts.outputDir),

      status,

      exitCode: ec,

      startedAt,

      finishedAt,

      error: serializeError(e),

      metadata: { initiatedBy },

      flow: emptyFlowMetadata(),

    });

  }

}



/**


 */


async function executeReplayPipeline(opts) {


  const startedAt = isoNow();


  const initiatedBy = opts.initiatedBy || "runtime";


  const { runReplay } = require("./replay/replay-engine");


  const holder = {


    pid: process.pid,


    jobId:


      opts.jobId || `${initiatedBy}_replay_${Date.now().toString(36)}_${process.pid}`,


    label: opts.holderLabel || `setup_boss_${initiatedBy}_replay`,

  };



  try {


    const fs = require("fs");


    const metaPath = path.join(opts.outputDir, "metadata.json");


    if (!fs.existsSync(metaPath)) {


      throw new RuntimeTerminalError("metadata.json ausente.", {


        code: "METADATA_MISSING",


        exitCode: 1,

      });

    }



    const meta = JSON.parse(fs.readFileSync(metaPath, "utf-8"));


    const projectRoot = meta.projectRoot;


    if (!projectRoot || typeof projectRoot !== "string")


      throw new RuntimeTerminalError("projectRoot inválido em metadata.json.", {


        code: "PROJECT_ROOT_INVALID",


        exitCode: 1,

      });



    const rootAbs = path.normalize(path.resolve(String(projectRoot)));



    const skipLock =


      opts.skipProjectLock === true || skipProjectLockByEnv();



    if (skipLock) await runReplay(opts.outputDir, opts.fromStep);


    else {


      await runWithProjectLock(rootAbs, holder, async () =>


        runReplay(opts.outputDir, opts.fromStep),

      );

    }



    const finishedAt = isoNow();


    const runId = path.basename(path.resolve(opts.outputDir));



    return buildResult({


      success: true,

      runId,

      outputDir: path.resolve(opts.outputDir),

      status: "completed",

      exitCode: 0,

      startedAt,

      finishedAt,

      error: null,

      metadata: { initiatedBy, fromStep: opts.fromStep },

      flow: emptyFlowMetadata(),

    });

  } catch (e) {


    const ec =


      e && typeof e.exitCode === "number"


        ? e.exitCode


        : e instanceof RuntimeTerminalError


          ? e.exitCode


          : 1;



    const finishedAt = isoNow();


    let status = "failed";


    if ((e && typeof e.code === "string" && e.code === "PROJECT_LOCKED")


      || msgHasLock(e))


      status = "blocked";



    return buildResult({


      success: false,

      runId: path.basename(path.resolve(opts.outputDir)),

      outputDir: path.resolve(opts.outputDir),

      status,

      exitCode: ec,

      startedAt,

      finishedAt,

      error: serializeError(e),

      metadata: { initiatedBy },

      flow: emptyFlowMetadata(),

    });

  }

}



module.exports = {


  executeRunPipeline,

  executeResumePipeline,

  executeDeterministicApplyPipeline,

  executeReplayPipeline,

  skipProjectLockByEnv,

  RuntimeTerminalError,

  buildResult,

  serializeError,

};
