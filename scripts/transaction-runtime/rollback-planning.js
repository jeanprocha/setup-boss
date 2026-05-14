/**
 * Planeamento de rollback — só análise e persistência; nunca aplicar mutações aqui (Fase 4.6).
 */

const fs = require("fs");
const path = require("path");

/**
 * @param {string} outputDir
 */
function buildRollbackPlan(outputDir) {
  const dir = String(outputDir || "");
  const blockers = [];
  const dependencies = [];
  const candidates = [];

  const hasExecutorChanges = fs.existsSync(path.join(dir, "executor-changes.json"));
  const hasPatchManifest = fs.existsSync(path.join(dir, "patch-manifest.json"));
  const metaPath = path.join(dir, "metadata.json");
  let pendingApply = false;
  if (fs.existsSync(metaPath)) {
    try {
      const m = JSON.parse(fs.readFileSync(metaPath, "utf8"));
      pendingApply = Boolean(m.execution && m.execution.pending_apply);
    } catch (_) {
      pendingApply = false;
    }
  }

  if (hasExecutorChanges) {
    candidates.push({
      id: "undo_executor_changes_json",
      kind: "artifact",
      path: "executor-changes.json",
      feasibility: false,
      note: "Reverter alterações requer apply/replay determinístico explícito — não automatizado na 4.6.",
    });
    dependencies.push({
      from: "executor-changes.json",
      to: "patch-manifest.json",
      kind: "optional_consistency",
    });
  }

  if (hasPatchManifest) {
    candidates.push({
      id: "patch_manifest_replay",
      kind: "replay",
      path: "patch-manifest.json",
      feasibility: false,
      note: "Rollback físico só via estratégia apply/replay reverso futura.",
    });
  }

  if (pendingApply) {
    blockers.push({
      code: "pending_apply_human_gate",
      detail: "Execução em dry-run com pending_apply requer decisão humana antes de rollback conceitual.",
    });
  }

  blockers.push({
    code: "no_hard_automation_phase46",
    detail: "Fase 4.6 não aplica rollback destrutivo automático ao working tree.",
  });

  const scope = {
    has_executor_changes: hasExecutorChanges,
    has_patch_manifest: hasPatchManifest,
    pending_apply: pendingApply,
  };

  return {
    generated_at: new Date().toISOString(),
    rollback_feasibility: false,
    rollback_possible: false,
    scope,
    candidates,
    dependencies,
    blockers,
    notes:
      "Apenas planeamento: candidatos são referências aos artefactos conhecidos; enforcement fica para fases futuras.",
  };
}

module.exports = {
  buildRollbackPlan,
};
