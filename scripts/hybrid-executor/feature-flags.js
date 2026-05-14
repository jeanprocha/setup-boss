/**
 * Feature flags Hybrid Executor — default OFF.
 */

function truthyEnv(v) {
  if (v === undefined || v === null) return false;
  const s = String(v).trim().toLowerCase();
  return s === "1" || s === "true" || s === "yes" || s === "on";
}

function parseLanguageList(raw) {
  if (raw === undefined || raw === null || String(raw).trim() === "") {
    return ["javascript", "typescript"];
  }
  return String(raw)
    .split(/[,;\s]+/)
    .map((x) => x.trim().toLowerCase())
    .filter(Boolean);
}

function isHybridExecutorEnabled() {
  return truthyEnv(process.env.HYBRID_EXECUTOR_ENABLED);
}

function isStructuralAstReadonlyEnabled() {
  return truthyEnv(process.env.STRUCTURAL_AST_READONLY_ENABLED);
}

function getStructuralLanguagesEnabled() {
  return new Set(parseLanguageList(process.env.STRUCTURAL_LANGUAGES_ENABLED));
}

function isStructuralPlanningEnabled() {
  return truthyEnv(process.env.STRUCTURAL_PLANNING_ENABLED);
}

/** Fase 4.9.4 — execução híbrida structural-first apply (fallback textual automático). */
function isHybridExecutionEnabled() {
  return truthyEnv(process.env.HYBRID_EXECUTION_ENABLED);
}

/** Fase 4.9.5 — apply estrutural oficial com pós-validação AST + rollback lógico (default OFF). */
function isStructuralApplyEnabled() {
  return truthyEnv(process.env.STRUCTURAL_APPLY_ENABLED);
}

/**
 * Threshold 0–1 comparado ao `confidence_score` 0–100 (ex.: 0.90 ⇒ min 90 pontos).
 * Aceita também 0–100 no env (ex.: 90).
 */
function getStructuralExecutionMinConfidenceFraction() {
  const raw = process.env.STRUCTURAL_EXECUTION_MIN_CONFIDENCE;

  if (raw === undefined || raw === null || String(raw).trim() === "") return 0.9;

  const n = Number(String(raw).trim().replace(",", "."));

  if (!Number.isFinite(n)) return 0.9;
  if (n > 1 && n <= 100) return n / 100;
  if (n >= 0 && n <= 1) return n;

  return 0.9;
}

function isHybridExecutionApplyActive() {
  return (
    isHybridExecutorEnabled() &&
    isStructuralAstReadonlyEnabled() &&
    isStructuralPlanningEnabled() &&
    isHybridExecutionEnabled()
  );
}

/**
 * Apply estrutural controlado ativo só com gate 4.9.4 completo + flag STRUCTURAL_APPLY_ENABLED.
 */
function isControlledStructuralApplyActive() {
  return isHybridExecutionApplyActive() && isStructuralApplyEnabled();
}

/** Fase 4.9.1 — AST-only shadow (parse + artefacts). */
function isHybridShadowReadonlyActive() {
  return isHybridExecutorEnabled() && isStructuralAstReadonlyEnabled();
}

/** Fase 4.9.2 — planning textual→MVP sob o mesmo gated master hybrid + AST-readonly + flag planning. */
function isStructuralPlanningShadowActive() {
  return isHybridShadowReadonlyActive() && isStructuralPlanningEnabled();
}

/** Fase 4.9.3 — simulação replace_node em span MVP + comparação com patch textual (artefactos apenas). */
function isStructuralShadowTransformsEnabled() {
  return truthyEnv(process.env.STRUCTURAL_SHADOW_TRANSFORMS_ENABLED);
}

/** Fase 4.9.6 — governança estrutural incremental (default OFF). */
function isStructuralGovernanceEnabled() {
  return truthyEnv(process.env.STRUCTURAL_GOVERNANCE_ENABLED);
}

/** Fase 4.9.6.1 — fundação replay/fingerprints (default OFF; só relatórios). */
function isStructuralReplayFoundationEnabled() {
  return truthyEnv(process.env.STRUCTURAL_REPLAY_FOUNDATION_ENABLED);
}

/** Fase 4.9.6.1 — análise de idempotência em relatórios (default OFF). */
function isStructuralIdempotencyEnabled() {
  return truthyEnv(process.env.STRUCTURAL_IDEMPOTENCY_ENABLED);
}

/** Fase 4.9.7 — simulação de replay estrutural em shadow (artefactos apenas; default OFF). */
function isStructuralReplayShadowEnabled() {
  return truthyEnv(process.env.STRUCTURAL_REPLAY_SHADOW_ENABLED);
}

/**
 * Comportamento quando confidence está abaixo do limiar (relatório/governança).
 * `block` elevam o risco agregado a high; `warning` mantém aviso (default).
 */
function getStructuralGovernanceLowConfidenceMode() {
  const s = String(process.env.STRUCTURAL_GOVERNANCE_LOW_CONFIDENCE_MODE || "warning")
    .trim()
    .toLowerCase();

  return s === "block" ? "block" : "warning";
}

function isStructuralShadowTransformsShadowActive() {
  return isStructuralPlanningShadowActive() && isStructuralShadowTransformsEnabled();
}

/** Fase 4.9.7.1 — resumo runtime + validação de artefactos no outputDir (default OFF). */
function isHybridRuntimeObservabilityEnabled() {
  return truthyEnv(process.env.HYBRID_RUNTIME_OBSERVABILITY_ENABLED);
}

function getHybridRuntimeEnvSnapshot() {
  return {
    HYBRID_EXECUTOR_ENABLED: truthyEnv(process.env.HYBRID_EXECUTOR_ENABLED),
    STRUCTURAL_AST_READONLY_ENABLED: truthyEnv(process.env.STRUCTURAL_AST_READONLY_ENABLED),
    STRUCTURAL_PLANNING_ENABLED: truthyEnv(process.env.STRUCTURAL_PLANNING_ENABLED),
    STRUCTURAL_SHADOW_TRANSFORMS_ENABLED: truthyEnv(process.env.STRUCTURAL_SHADOW_TRANSFORMS_ENABLED),
    HYBRID_EXECUTION_ENABLED: truthyEnv(process.env.HYBRID_EXECUTION_ENABLED),
    STRUCTURAL_APPLY_ENABLED: truthyEnv(process.env.STRUCTURAL_APPLY_ENABLED),
    STRUCTURAL_GOVERNANCE_ENABLED: truthyEnv(process.env.STRUCTURAL_GOVERNANCE_ENABLED),
    STRUCTURAL_REPLAY_FOUNDATION_ENABLED: truthyEnv(process.env.STRUCTURAL_REPLAY_FOUNDATION_ENABLED),
    STRUCTURAL_IDEMPOTENCY_ENABLED: truthyEnv(process.env.STRUCTURAL_IDEMPOTENCY_ENABLED),
    STRUCTURAL_REPLAY_SHADOW_ENABLED: truthyEnv(process.env.STRUCTURAL_REPLAY_SHADOW_ENABLED),
    HYBRID_RUNTIME_OBSERVABILITY_ENABLED: truthyEnv(process.env.HYBRID_RUNTIME_OBSERVABILITY_ENABLED),
  };
}

function isLanguageEnabledForStructural(lang) {
  const set = getStructuralLanguagesEnabled();
  if (set.size === 0) return false;
  return set.has(String(lang || "").toLowerCase());
}

module.exports = {
  isHybridExecutorEnabled,
  isStructuralAstReadonlyEnabled,
  getStructuralLanguagesEnabled,
  isStructuralPlanningEnabled,
  isStructuralPlanningShadowActive,
  isStructuralShadowTransformsEnabled,
  isStructuralShadowTransformsShadowActive,
  isHybridExecutionEnabled,
  getStructuralExecutionMinConfidenceFraction,
  isHybridExecutionApplyActive,
  isStructuralApplyEnabled,
  isControlledStructuralApplyActive,
  isStructuralGovernanceEnabled,
  getStructuralGovernanceLowConfidenceMode,
  isStructuralReplayFoundationEnabled,
  isStructuralIdempotencyEnabled,
  isStructuralReplayShadowEnabled,
  isHybridRuntimeObservabilityEnabled,
  getHybridRuntimeEnvSnapshot,
  isHybridShadowReadonlyActive,
  isLanguageEnabledForStructural,
  parseLanguageList,
};
