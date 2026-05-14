/**
 * Motor de recovery — planeamento e hints compatíveis com resume/replay existentes (sem rollback automático).
 */

const fs = require("fs");
const path = require("path");

const { assessResume } = require("../runtime/replay/resume-engine");
const { readCheckpoints } = require("../runtime/replay/checkpoint-manager");

function readJson(p) {
  try {
    return JSON.parse(fs.readFileSync(p, "utf8"));
  } catch (_) {
    return null;
  }
}

/**
 * @param {string} outputDir
 * @param {object} [opts]
 * @param {boolean} [opts.deep] — incluir bloco compacto assessResume
 */
function buildRecoveryAnalysis(outputDir, opts = {}) {
  const dir = String(outputDir || "");
  const deep = opts.deep === true;

  const assessment = assessResume(dir);
  const legacy = readCheckpoints(dir);

  const transactionalHooks = [];
  const contractPath = path.join(dir, "transaction-runtime.json");
  if (fs.existsSync(contractPath)) {
    try {
      const doc = JSON.parse(fs.readFileSync(contractPath, "utf8"));
      if (doc && Array.isArray(doc.checkpoints)) {
        for (const c of doc.checkpoints) {
          if (c && c.hook) transactionalHooks.push(String(c.hook));
        }
      }
    } catch (_) {
      /* noop */
    }
  }

  const hints = [];

  if (assessment && assessment.ok && assessment.next_phase) {
    hints.push({
      code: "resume_next_phase",
      next_phase: assessment.next_phase,
      source: "assess_resume",
    });
  } else if (assessment && !assessment.ok) {
    hints.push({
      code: "resume_not_ok",
      reason: assessment.reason || "unknown",
      source: "assess_resume",
    });
  }

  if (legacy && Array.isArray(legacy.checkpoints) && legacy.checkpoints.length) {
    const last = legacy.checkpoints[legacy.checkpoints.length - 1];
    hints.push({
      code: "last_legacy_checkpoint",
      phase_completed: last.phase_completed || null,
      source: "runtime-checkpoints.json",
    });
  }

  const meta = readJson(path.join(dir, "metadata.json"));
  const lifecycle =
    meta && meta.execution ? meta.execution.lifecycle_state || null : null;

  const recovery_possible = Boolean(assessment && assessment.ok);

  const out = {
    generated_at: new Date().toISOString(),
    recovery_possible,
    transactional_checkpoint_hooks: transactionalHooks.slice(-48),
    resumable_stages_hint: Array.from(new Set(transactionalHooks)),
    checkpoint_recovery_possible: Boolean(
      legacy && Array.isArray(legacy.checkpoints) && legacy.checkpoints.length > 0,
    ),
    replay_recovery_possible: Boolean(
      fs.existsSync(path.join(dir, "patch-manifest.json")) ||
        fs.existsSync(path.join(dir, "executor-result.json")),
    ),
    lifecycle_seen: lifecycle,
    hints,
  };

  if (deep && assessment && typeof assessment === "object") {
    out.resume_assessment = {
      ok: assessment.ok,
      reason: assessment.reason || null,
      next_phase: assessment.next_phase || null,
    };
  }

  return out;
}

module.exports = {
  buildRecoveryAnalysis,
};
