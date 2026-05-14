/**
 * Consistência de ciclo de vida + checkpoints (Fase 2.8).
 */

const fs = require("fs");
const path = require("path");
const { readJsonSafe } = require("../../cli/lib/json-io");
const { readCheckpoints, lastCheckpoint } = require("../replay/checkpoint-manager");
const { buildTemporalInspectReport } = require("../replay/temporal-status");
const { ALL_STATES } = require("../replay/lifecycle");

const PHASE_ORDER_HINT = [
  "AFTER_PREFLIGHT",
  "AFTER_ARCHITECT",
  "AFTER_EXECUTOR",
  "AFTER_REVIEW",
  "AFTER_CORRECTION",
];

/**
 * @param {string} outputDir
 * @returns {{ ok: boolean, issues: { severity: 'error'|'warn', code: string, message: string }[] }}
 */
function validateLifecycleConsistency(outputDir) {
  const issues = [];
  const dir = path.resolve(String(outputDir || ""));

  const meta = readJsonSafe(path.join(dir, "metadata.json"), 3_000_000);
  const runLog = readJsonSafe(path.join(dir, "run-log.json"), 3_000_000);
  const review = readJsonSafe(path.join(dir, "review-output.json"), 512_000);

  const exec = meta && meta.execution && typeof meta.execution === "object" ? meta.execution : {};
  const life = exec.lifecycle_state != null ? String(exec.lifecycle_state) : "";

  if (life && life !== "—" && !ALL_STATES.has(life)) {
    issues.push({
      severity: "warn",
      code: "UNKNOWN_LIFECYCLE",
      message: `Estado não reconhecido: ${life}`,
    });
  }

  if (runLog && runLog.status === "success" && review && review.status === "approved") {
    const pend = exec.pending_apply === true;
    const applied = exec.lifecycle_state === "APPLIED";
    if (pend && applied) {
      issues.push({
        severity: "error",
        code: "IMPOSSIBLE_PENDING_AND_APPLIED",
        message: "pending_apply=true e lifecycle APPLIED são mutuamente exclusivos.",
      });
    }
  }

  const cpDoc = readCheckpoints(dir);
  if (cpDoc && typeof cpDoc === "object" && Array.isArray(cpDoc.checkpoints)) {
    const phases = cpDoc.checkpoints.map((c) => String(c.phase_completed || ""));
    for (let i = 1; i < phases.length; i++) {
      const a = phases[i - 1];
      const b = phases[i];
      const ia = PHASE_ORDER_HINT.indexOf(a);
      const ib = PHASE_ORDER_HINT.indexOf(b);
      if (ia >= 0 && ib >= 0 && ib < ia) {
        issues.push({
          severity: "warn",
          code: "CHECKPOINT_PHASE_ORDER",
          message: `Ordem de checkpoints suspeita: ${a} → ${b}`,
        });
        break;
      }
    }

    const last = lastCheckpoint(dir);
    if (last && last.artifact_hashes && typeof last.artifact_hashes === "object") {
      for (const [name, hash] of Object.entries(last.artifact_hashes)) {
        if (!hash) continue;
        const p = path.join(dir, name);
        if (!fs.existsSync(p)) {
          issues.push({
            severity: "warn",
            code: "CHECKPOINT_HASH_ORPHAN",
            message: `Último checkpoint referencia artefacto ausente: ${name}`,
          });
          break;
        }
      }
    }
  }

  const temporal = buildTemporalInspectReport(dir, meta && meta.projectRoot);
  if (temporal.invalid_checkpoint_doc) {
    issues.push({
      severity: "warn",
      code: "INVALID_CHECKPOINT_DOC",
      message: "runtime-checkpoints.json com schema inválido.",
    });
  }
  if (temporal.stale_manifest) {
    issues.push({
      severity: "error",
      code: "STALE_MANIFEST",
      message: "executor-changes.json não coincide com patch-manifest (replay/apply inseguros).",
    });
  }

  const errors = issues.filter((x) => x.severity === "error");
  return { ok: errors.length === 0, issues };
}

module.exports = {
  validateLifecycleConsistency,
  PHASE_ORDER_HINT,
};
