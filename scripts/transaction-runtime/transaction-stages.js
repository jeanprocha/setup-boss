/**
 * Estágios transacionais formais — ordem, transições, invariantes lógicas.
 */

const { CHECKPOINT_HOOKS } = require("./constants");

/** @type {readonly { id: string, label: string, hooks_enter: readonly string[], hooks_exit?: readonly string[] }[]} */
const STAGE_DEFINITIONS = Object.freeze([
  {
    id: "initialization",
    label: "Initialization",
    hooks_enter: ["post_preflight"],
  },
  {
    id: "planning",
    label: "Planning",
    hooks_enter: ["post_architect", "post_plan"],
  },
  {
    id: "validation",
    label: "Validation",
    hooks_enter: ["post_validation"],
  },
  {
    id: "risk_analysis",
    label: "Risk analysis",
    hooks_enter: ["post_risk"],
  },
  {
    id: "review",
    label: "Review",
    hooks_enter: ["post_review"],
  },
  {
    id: "correction",
    label: "Correction",
    hooks_enter: ["post_correction"],
  },
  {
    id: "execution",
    label: "Execution",
    hooks_enter: ["post_executor"],
  },
  {
    id: "finalization",
    label: "Finalization",
    hooks_enter: ["post_knowledge"],
  },
]);

const HOOK_TO_STAGE_ID = {};
for (const def of STAGE_DEFINITIONS) {
  for (const h of def.hooks_enter) {
    HOOK_TO_STAGE_ID[h] = def.id;
  }
}

const STAGE_IDS = STAGE_DEFINITIONS.map((s) => s.id);

/** Ordem de relatório apenas (exploração); continuidade usada em runtime é o autómato `HOOK_TRANSITIONS`. */
const STAGE_PIPELINE_ORDER = STAGE_IDS.slice();

const HOOK_TRANSITIONS = Object.freeze({
  __start__: ["post_preflight"],
  post_preflight: ["post_architect"],
  post_architect: ["post_plan", "post_executor"],
  post_plan: ["post_executor"],
  post_executor: ["post_validation"],
  post_validation: ["post_risk"],
  post_risk: ["post_review"],
  post_review: ["post_correction", "post_knowledge"],
  post_correction: ["post_executor"],
  post_knowledge: [],
});

/** @type {readonly string[]} */
function orderedHooksForStages() {
  const orderHooks = [];
  for (const stageId of STAGE_PIPELINE_ORDER) {
    const def = STAGE_DEFINITIONS.find((s) => s.id === stageId);
    if (!def) continue;
    for (const h of def.hooks_enter) orderHooks.push(h);
  }
  return orderHooks;
}

/** @returns {readonly string[]} */
function getStageOrderAssertions() {
  return STAGE_PIPELINE_ORDER.slice();
}

/**
 * @param {string} hook
 */
function hookToStage(hook) {
  return HOOK_TO_STAGE_ID[hook] || null;
}

/**
 * @param {string[]} recordedHooks ordem cronológica
 */
function validateHookFsm(recordedHooks) {
  const assertions = [];
  let ok = true;
  let prev = "__start__";

  for (let i = 0; i < recordedHooks.length; i++) {
    const h = recordedHooks[i];
    if (!CHECKPOINT_HOOKS.includes(h)) {
      assertions.push({
        id: `unknown_hook@${i}`,
        ok: false,
        from: prev,
        to: h,
        detail: `Hook desconhecido: ${h}`,
      });
      ok = false;
      continue;
    }

    const allowed = HOOK_TRANSITIONS[prev];
    const edgeOk = Array.isArray(allowed) && allowed.includes(h);
    assertions.push({
      id: `transition@${i}`,
      ok: edgeOk,
      from: prev,
      to: h,
      stage: hookToStage(h),
      allowed_targets: allowed ? allowed.slice() : [],
    });
    if (!edgeOk) ok = false;

    prev = h;
  }

  return { ok, assertions };
}

/**
 * @param {string[]} recordedHooks ordem cronológica
 */
function assertMonotonicStages(recordedHooks) {
  return validateHookFsm(recordedHooks);
}

function initialStageTransitions() {
  return STAGE_IDS.map((id) => ({
    stage_id: id,
    entered_at: null,
    exited_at: null,
    status: id === "initialization" ? "pending" : "pending",
    replay_safe: true,
  }));
}

/**
 * Actualiza marcação minimal de entrada de estádio com base num hook concluído.
 * @param {object[]} stages array mutável cópia de transaction.stages
 * @param {string} hook
 * @param {string} iso
 */
function markStageEnteredForHook(stages, hook, iso) {
  const sid = hookToStage(hook);
  if (!sid) return stages;
  const row = stages.find((s) => s && s.stage_id === sid);
  if (!row) return stages;
  if (!row.entered_at) row.entered_at = iso;
  row.status = "entered";
  return stages;
}

module.exports = {
  STAGE_DEFINITIONS,
  STAGE_IDS,
  STAGE_PIPELINE_ORDER,
  HOOK_TRANSITIONS,
  orderedHooksForStages,
  getStageOrderAssertions,
  hookToStage,
  validateHookFsm,
  assertMonotonicStages,
  initialStageTransitions,
  markStageEnteredForHook,
};
