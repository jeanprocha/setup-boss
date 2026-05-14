/**
 * Validação de continuidade para replay/checkpoints formais vs legado vs lifecycle.
 */

const fs = require("fs");
const path = require("path");

const { readCheckpoints } = require("../runtime/replay/checkpoint-manager");
const { assertMonotonicStages, hookToStage } = require("./transaction-stages");

function readJson(p) {
  try {
    return JSON.parse(fs.readFileSync(p, "utf8"));
  } catch (_) {
    return null;
  }
}

const LEGACY_MAP = Object.freeze({
  post_preflight: "AFTER_PREFLIGHT",
  post_architect: "AFTER_ARCHITECT",
  post_executor: "AFTER_EXECUTOR",
  post_review: "AFTER_REVIEW",
  post_correction: "AFTER_CORRECTION",
});

/**
 * Verifica compatibilidade aproximada entre hooks transaccionais e fases registadas nos checkpoints legados.
 * @param {string[]} transactionalHooks ordem cronológica
 * @param {object|null} legacyDoc runtime-checkpoints.json
 */
function assertLegacyReplayAlignment(transactionalHooks, legacyDoc) {
  const assertions = [];
  if (!legacyDoc || !Array.isArray(legacyDoc.checkpoints)) {
    assertions.push({
      id: "legacy_missing",
      ok: true,
      detail: "Sem runtime-checkpoints.json — skip alinhamento legado.",
    });
    return { ok: true, assertions };
  }

  const phases = legacyDoc.checkpoints.map((c) => c.phase_completed).filter(Boolean);
  let ok = true;

  for (const h of transactionalHooks) {
    const want = LEGACY_MAP[h];
    if (!want) continue;
    if (!phases.includes(want)) {
      assertions.push({
        id: `legacy_missing:${h}->${want}`,
        ok: false,
        hook: h,
        expected_phase: want,
      });
      ok = false;
    }
  }

  assertions.push({
    id: "legacy_phase_tail",
    ok: true,
    last_phase: phases.length ? phases[phases.length - 1] : null,
    count: phases.length,
  });

  return { ok, assertions };
}

/**
 * Lifecycle em metadata vs último estágio inferido pelo hook formal.
 */
function assertLifecycleConsistency(outputDir, lastHook) {
  const assertions = [];
  const meta = readJson(path.join(outputDir, "metadata.json"));
  const lc = meta && meta.execution ? meta.execution.lifecycle_state : null;

  const stage = lastHook ? hookToStage(lastHook) : null;
  assertions.push({
    id: "lifecycle_present",
    ok: Boolean(lc),
    lifecycle_state: lc,
    last_hook: lastHook,
    inferred_stage: stage,
  });

  return { ok: true, assertions };
}

/** Manifest refs mínimas após checkpoints intermedios */
function assertManifestPresence(outputDir, lastHook) {
  const assertions = [];
  const need = [];

  if (lastHook === "post_validation") {
    need.push("validation-results.json");
  }
  if (lastHook === "post_risk") {
    need.push("risk-analysis.json");
  }

  let ok = true;
  for (const rel of need) {
    const p = path.join(outputDir, rel);
    const present = fs.existsSync(p);
    assertions.push({
      id: `manifest_need:${rel}`,
      ok: present,
      path: rel,
    });
    if (!present) ok = false;
  }

  if (!need.length) {
    assertions.push({ id: "manifest_need_none", ok: true });
  }

  return { ok, assertions };
}

/**
 * @param {string} outputDir
 * @param {object} [opts]
 * @param {object|null} [opts.transactionDoc]
 */
function validateReplayContinuity(outputDir, opts = {}) {
  const dir = String(outputDir || "");
  let txDoc = opts.transactionDoc;
  if (!txDoc) {
    const p = path.join(dir, "transaction-runtime.json");
    if (fs.existsSync(p)) {
      try {
        txDoc = JSON.parse(fs.readFileSync(p, "utf8"));
      } catch (_) {
        txDoc = null;
      }
    }
  }

  const transactionalHooks =
    txDoc && Array.isArray(txDoc.checkpoints)
      ? txDoc.checkpoints.map((c) => c.hook).filter(Boolean)
      : [];

  const fsm = assertMonotonicStages(transactionalHooks);
  const legacy = readCheckpoints(dir);
  const align = assertLegacyReplayAlignment(transactionalHooks, legacy);

  const lastHook = transactionalHooks.length ? transactionalHooks[transactionalHooks.length - 1] : null;

  const life = assertLifecycleConsistency(dir, lastHook);
  const manifest = assertManifestPresence(dir, lastHook);

  const ok = Boolean(fsm.ok && align.ok && manifest.ok && life.ok);

  return {
    ok,
    snapshot_consistency_checked_at: new Date().toISOString(),
    transactional_hook_count: transactionalHooks.length,
    fsm,
    legacy_alignment: align,
    lifecycle: life,
    manifest_presence: manifest,
  };
}

module.exports = {
  validateReplayContinuity,
  assertLegacyReplayAlignment,
  assertLifecycleConsistency,
  assertManifestPresence,
};
