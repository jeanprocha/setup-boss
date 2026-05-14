/**
 * Motor heurístico do grafo incremental (Fase 4.2).
 * Inputs: targets, plan (ops), reconciliation (opcional), política de estágios.
 */

const crypto = require("crypto");
const { VALIDATION_GRAPH_SCHEMA_VERSION } = require("../constants");
const { getAdapterMeta, mapInferredToAdapterId } = require("../validators/registry");

function stableValidatorNodeId(parts) {
  const payload = [
    String(parts.stage || ""),
    String(parts.adapter_id || ""),
    [...(parts.paths || [])].sort((a, b) => a.localeCompare(b)).join("\u001f"),
  ].join("\u001e");
  return `vn-${crypto.createHash("sha256").update(payload, "utf8").digest("hex").slice(0, 16)}`;
}

/**
 * @param {{
 *   targetsDoc: object|null,
 *   plan: object|null,
 *   reconciliation: object|null,
 *   enabledStages: string[],
 * }} input
 */
function buildValidationGraph(input) {
  const targetsDoc = input.targetsDoc && typeof input.targetsDoc === "object" ? input.targetsDoc : {};
  const targets = Array.isArray(targetsDoc.targets) ? targetsDoc.targets : [];
  const enabled = new Set(
    Array.isArray(input.enabledStages) && input.enabledStages.length
      ? input.enabledStages
      : ["structural", "syntax", "lightweight"],
  );

  /** @type {Map<string, { paths: Set<string>, target_ids: Set<string>, scopes: Set<string> }>} */
  const accum = new Map();

  for (const t of targets) {
    if (!t || typeof t !== "object") continue;
    const file = t.file != null ? String(t.file).replace(/\\/g, "/").trim() : "";
    const tid = t.target_id != null ? String(t.target_id) : "";
    const scope = t.validation_scope === "module" || t.validation_scope === "project"
      ? t.validation_scope
      : "file";
    const inferred = Array.isArray(t.inferred_validators) ? t.inferred_validators : [];

    for (const inf of inferred) {
      const adapterId = mapInferredToAdapterId(inf);
      if (!adapterId) continue;
      const meta = getAdapterMeta(adapterId);
      if (!meta || !enabled.has(meta.stage)) continue;

      const key = `${meta.stage}\u001f${adapterId}`;
      let slot = accum.get(key);
      if (!slot) {
        slot = { paths: new Set(), target_ids: new Set(), scopes: new Set() };
        accum.set(key, slot);
      }
      if (file) slot.paths.add(file);
      if (tid) slot.target_ids.add(tid);
      slot.scopes.add(scope);
    }
  }

  const nodes = [];
  const sortedKeys = [...accum.keys()].sort((a, b) => a.localeCompare(b));

  for (const key of sortedKeys) {
    const slot = accum.get(key);
    const [stage, adapterId] = key.split("\u001f");
    const paths = [...slot.paths].sort((a, b) => a.localeCompare(b));
    const meta = getAdapterMeta(adapterId);
    const tier = meta && Number.isFinite(meta.order_tier) ? meta.order_tier : 99;

    const scope =
      slot.scopes.has("project")
        ? "project"
        : slot.scopes.has("module")
          ? "module"
          : "file";

    const validator_node_id = stableValidatorNodeId({ stage, adapter_id: adapterId, paths });

    nodes.push({
      validator_node_id,
      validator_type: adapterId,
      stage,
      tier,
      target_ids: [...slot.target_ids].sort((a, b) => a.localeCompare(b)),
      paths,
      scope,
      depends_on: [],
      metadata: {
        source: "validation_targets",
      },
      extensions: {},
    });
  }

  nodes.sort((a, b) => {
    const si = String(a.stage).localeCompare(String(b.stage));
    if (si !== 0) return si;
    const ti = Number(a.tier) - Number(b.tier);
    if (ti !== 0) return ti;
    return String(a.validator_type).localeCompare(String(b.validator_type));
  });

  const stageIds = [...enabled].sort((a, b) => a.localeCompare(b));
  const stages = [];
  for (const st of stageIds) {
    const vids = nodes.filter((n) => n.stage === st).map((n) => n.validator_node_id);
    if (vids.length) {
      stages.push({
        stage_id: st,
        validator_node_ids: vids,
        metadata: {},
      });
    }
  }

  const graphBody = JSON.stringify({
    schema_version: VALIDATION_GRAPH_SCHEMA_VERSION,
    nodes: nodes.map((n) => ({
      validator_node_id: n.validator_node_id,
      validator_type: n.validator_type,
      stage: n.stage,
      tier: n.tier,
      paths: n.paths,
      target_ids: n.target_ids,
      scope: n.scope,
      depends_on: n.depends_on,
    })),
    stages: stages.map((s) => ({
      stage_id: s.stage_id,
      validator_node_ids: s.validator_node_ids,
    })),
  });

  const graph_fingerprint_sha256 = crypto.createHash("sha256").update(graphBody, "utf8").digest("hex");

  return {
    schema_version: VALIDATION_GRAPH_SCHEMA_VERSION,
    graph_fingerprint_sha256,
    generated_at: new Date().toISOString(),
    stages,
    nodes,
    batches: nodes.map((n) => ({
      batch_id: n.validator_node_id,
      validator_node_id: n.validator_node_id,
      paths: n.paths,
    })),
    metadata: {
      targets_total: targets.length,
      nodes_total: nodes.length,
    },
    extensions: {},
  };
}

module.exports = {
  buildValidationGraph,
  stableValidatorNodeId,
};
