/**
 * Reexecução selectiva de etapas usando artefactos persistidos (sem scan/architect).
 */

const fs = require("fs");
const path = require("path");
const { createStageContextFromOutputDir } = require("../runtime-context");
const { runExecutor } = require("../../executor");
const { runReview } = require("../../review");
const { runCorrection } = require("../../correction");
const { RUNTIME_LIFECYCLE } = require("./lifecycle");
const { loadMergedPolicy } = require("../governance/policy-loader");
const { enforceReplayGovernanceContinuity } = require("../governance/governance-continuity");

function readJson(p) {
  try {
    return JSON.parse(fs.readFileSync(p, "utf-8"));
  } catch (_) {
    return null;
  }
}

function writeLifecycle(outputDir, lifecycleState, extra = {}) {
  const metaPath = path.join(outputDir, "metadata.json");
  if (!fs.existsSync(metaPath)) return;
  const meta = readJson(metaPath);
  if (!meta) return;
  meta.execution = {
    ...(meta.execution || {}),
    lifecycle_state: lifecycleState,
    ...extra,
  };
  fs.writeFileSync(metaPath, JSON.stringify(meta, null, 2), "utf-8");
}

const REPLAY_STEPS = new Set(["executor", "review", "correction"]);

/**
 * @param {string} outputDir
 * @param {'executor'|'review'|'correction'} fromStep
 */
async function runReplay(outputDir, fromStep) {
  if (!REPLAY_STEPS.has(fromStep)) {
    throw new Error(`replay: --from inválido (use executor|review|correction).`);
  }

  const runId = path.basename(outputDir);
  const metaPath = path.join(outputDir, "metadata.json");
  const meta = readJson(metaPath);
  if (!meta) {
    throw new Error("replay: metadata.json ausente.");
  }

  enforceReplayGovernanceContinuity(outputDir);

  try {
    const pr = meta.projectRoot;
    if (pr && typeof pr === "string" && fs.existsSync(pr)) {
      const pack = loadMergedPolicy({
        projectRootAbs: path.resolve(pr),
        policyProfileCli: null,
        forcePolicyBypassFlow: false,
        disableGovernanceFlow: false,
      });
      const prof =
        pack &&
        pack.merged &&
        String(pack.merged.profile || "").toUpperCase() === "ENTERPRISE";
      if (prof && !pack.disabled) {
        console.warn(
          "[governance] Replay com perfil ENTERPRISE na política do projecto — confirme registos e aprovações antes de repetir etapas.",
        );
      }
    }
  } catch (_) {
    /* replay não deve falhar por aviso opcional */
  }

  const prevLifecycle = meta.execution && meta.execution.lifecycle_state;
  const executionBackup = { ...(meta.execution || {}) };

  writeLifecycle(outputDir, RUNTIME_LIFECYCLE.REPLAYING, {
    replay_from: fromStep,
    replay_started_at: new Date().toISOString(),
  });

  const dryRun = meta.execution && meta.execution.mode === "dry_run";
  const ctx = createStageContextFromOutputDir(outputDir, {
    runId,
    execution: { dryRun: Boolean(dryRun) },
  });

  try {
    if (fromStep === "executor") {
      await runExecutor(ctx);
    } else if (fromStep === "review") {
      await runReview(ctx);
    } else {
      await runCorrection(ctx, { exitOnFailure: false });
    }
  } finally {
    const m = readJson(path.join(outputDir, "metadata.json"));
    if (m) {
      m.execution = {
        ...executionBackup,
        replay_finished_at: new Date().toISOString(),
        replay_last_from: fromStep,
      };
      if (prevLifecycle != null) {
        m.execution.lifecycle_state = prevLifecycle;
      }
      fs.writeFileSync(
        path.join(outputDir, "metadata.json"),
        JSON.stringify(m, null, 2),
        "utf-8",
      );
    }
  }
}

module.exports = {
  runReplay,
  REPLAY_STEPS,
};
