/**
 * Fase 4.11.2 — Regras de review estrutural (determinísticas, best-effort).
 * Observacional: não bloqueia pipeline.
 *
 * Mapeamento rápido (códigos estáveis → grupo):
 * - Artefactos quebrados: structural_referenced_file_missing, structural_resolved_requires_results_artifact
 * - Grafo inconsistente: structural_graph_edge_dangling, structural_graph_node_duplicate, structural_graph_node_invalid
 * - Targets inválidos: structural_target_file_missing
 * - Commands/results desalinhados: structural_resolved_command_unknown_target, structural_resolved_missing_result_rows, structural_result_orphan_command
 * - Fingerprint de grafo inválido: structural_graph_fingerprint_invalid, structural_graph_fingerprint_mismatch
 */

"use strict";

const fs = require("fs");
const path = require("path");
const { normalizePath } = require("../execution-plan/normalization/operation-normalizer");
const { sha256HexUtf8 } = require("../execution-plan/fingerprint/plan-fingerprint");
const {
  exportGraphDocCanonicalJson,
} = require("../execution-plan/validation-targeting/dependency-graph");
const { readJsonSafe } = require("./lib/runtime-snapshot");
const { sha256ShortDeterministicReview } = require("./contract/deterministic-review-contract");
const { VALIDATION_RESULTS_FILENAME } = require("../execution-plan/validation-targeting/constants");
const { EXECUTION_PLAN_FILENAME } = require("../execution-plan/persistence/plan-store");

const GRAPH_NODE_TYPES = new Set(["file", "test", "module"]);

/**
 * @param {string} outputDir
 * @returns {string|null}
 */
function resolveProjectRootBestEffort(outputDir) {
  const dir = String(outputDir || "");
  if (!dir) return null;
  const meta = readJsonSafe(path.join(dir, "metadata.json"));
  const raw = meta && meta.projectRoot != null ? String(meta.projectRoot).trim() : "";
  if (!raw) return null;
  const abs = path.isAbsolute(raw) ? raw : path.resolve(dir, raw);
  try {
    if (fs.existsSync(abs)) return abs;
  } catch (_) {
    /* ignore */
  }
  return null;
}

function findingStructural(code, severity, message, evidence, related_targets, idPayload) {
  const payload = { code, ...(idPayload && typeof idPayload === "object" ? idPayload : {}) };
  return {
    finding_id: `dr-${sha256ShortDeterministicReview(payload)}`,
    type: "structural",
    severity,
    code,
    message,
    evidence: evidence && typeof evidence === "object" ? evidence : {},
    related_targets: Array.isArray(related_targets) ? related_targets : [],
  };
}

function compactList(xs, max = 12) {
  const a = [...xs].filter(Boolean).sort((x, y) => String(x).localeCompare(String(y)));
  if (a.length <= max) return a;
  return a.slice(0, max).concat([`…+${a.length - max}`]);
}

/**
 * @param {object} input
 * @param {string} input.outputDir
 * @param {object|null} input.planDoc
 * @param {object|null} input.resultsDoc
 * @param {object|null} input.execPlan
 * @param {object|null} input.planArtifacts
 * @param {object|null} input.depGraph
 * @returns {object[]}
 */
function collectStructuralDeterministicFindings(input) {
  const out = [];
  const outputDir = String((input && input.outputDir) || "");
  const planDoc = input && input.planDoc && typeof input.planDoc === "object" ? input.planDoc : null;
  const resultsDoc =
    input && input.resultsDoc && typeof input.resultsDoc === "object" ? input.resultsDoc : null;
  const execPlan = input && input.execPlan && typeof input.execPlan === "object" ? input.execPlan : null;
  const planArtifacts =
    input && input.planArtifacts && typeof input.planArtifacts === "object" ? input.planArtifacts : null;
  const depGraph = input && input.depGraph && typeof input.depGraph === "object" ? input.depGraph : null;

  const projectRoot = resolveProjectRootBestEffort(outputDir);

  /** Manifest — caminhos relativos ao outputDir */
  if (planArtifacts && planArtifacts.artifacts && typeof planArtifacts.artifacts === "object") {
    const art = planArtifacts.artifacts;
    const keys = [
      "execution_plan",
      "reconciliation",
      "validation_targets",
      "validation_manifest",
      "validation_propagation_manifest",
      "dependency_graph",
      "validation_plan",
      "validation_results",
      "validation_cache",
      "validation_runtime_summary",
      "risk_analysis",
      "risk_runtime_manifest",
    ];
    for (const k of keys.sort((a, b) => a.localeCompare(b))) {
      const ref = art[k];
      if (typeof ref !== "string" || !ref || ref.startsWith("embedded:")) continue;
      const full = path.join(outputDir, ref);
      let missing = false;
      try {
        missing = !fs.existsSync(full);
      } catch (_) {
        missing = true;
      }
      if (missing) {
        out.push(
          findingStructural(
            "structural_referenced_file_missing",
            "error",
            `Manifesto aponta artefacto ausente em outputDir: ${k} → ${ref}.`,
            { manifest_key: k, ref },
            [],
            { code: "structural_referenced_file_missing", key: k, ref },
          ),
        );
      }
    }
    const gen = Array.isArray(art.generated) ? art.generated : [];
    for (const g of gen) {
      if (!g || typeof g !== "object") continue;
      const rel = g.path != null ? String(g.path) : "";
      if (!rel || rel.includes("..")) continue;
      const full = path.join(outputDir, rel);
      let missing = false;
      try {
        missing = !fs.existsSync(full);
      } catch (_) {
        missing = true;
      }
      if (missing) {
        out.push(
          findingStructural(
            "structural_referenced_file_missing",
            "warning",
            `Entrada plan-artifacts.generated referencia ficheiro ausente: ${rel}.`,
            { generated_path: rel },
            [],
            { code: "structural_referenced_file_missing", generated_path: rel },
          ),
        );
      }
    }
    const vep = art.extensions && art.extensions.validation_execution_plan;
    if (vep && typeof vep === "object") {
      for (const [ek, ev] of Object.entries(vep)) {
        if (typeof ev !== "string" || !ev || ev.startsWith("embedded:")) continue;
        const full = path.join(outputDir, ev);
        let missing = false;
        try {
          missing = !fs.existsSync(full);
        } catch (_) {
          missing = true;
        }
        if (missing) {
          out.push(
            findingStructural(
              "structural_referenced_file_missing",
              "warning",
              `extensions.validation_execution_plan.${ek} → ausente (${ev}).`,
              { extension_key: ek, ref: ev },
              [],
              { code: "structural_referenced_file_missing", ek, ref: ev },
            ),
          );
        }
      }
    }
  }

  /** Grafo de dependências */
  if (depGraph && Array.isArray(depGraph.nodes)) {
    const nodeIds = [];
    const seen = new Set();
    const dup = new Set();
    for (const n of depGraph.nodes) {
      if (!n || typeof n !== "object") continue;
      const nid = String(n.node_id || "");
      if (seen.has(nid)) dup.add(nid);
      if (nid) seen.add(nid);
      nodeIds.push(nid);
    }
    for (const d of [...dup].sort((a, b) => a.localeCompare(b))) {
      if (!d) continue;
      out.push(
        findingStructural(
          "structural_graph_node_duplicate",
          "error",
          `node_id duplicado no dependency-graph: ${d}.`,
          { node_id: d },
          [],
          { code: "structural_graph_node_duplicate", node_id: d },
        ),
      );
    }

    const nodeSet = new Set(nodeIds.filter(Boolean));
    for (const n of depGraph.nodes) {
      if (!n || typeof n !== "object") continue;
      const nid = String(n.node_id || "");
      const ty = String(n.type || "");
      const p = normalizePath(n.path != null ? String(n.path) : "");
      const reasons = [];
      if (!nid) reasons.push("empty_node_id");
      if (!ty || !GRAPH_NODE_TYPES.has(ty)) reasons.push("invalid_type");
      if (!p) reasons.push("empty_path");
      if (p.includes("..")) reasons.push("path_escape");
      if (reasons.length) {
        out.push(
          findingStructural(
            "structural_graph_node_invalid",
            "error",
            "Nó inválido no dependency-graph (campos obrigatórios / tipo / path).",
            { node_id: nid || null, type: ty || null, path: p || null, reasons: reasons.sort() },
            [],
            { code: "structural_graph_node_invalid", node_id: nid, reasons: reasons.sort() },
          ),
        );
      }
    }

    const edges = Array.isArray(depGraph.edges) ? depGraph.edges : [];
    for (const e of edges) {
      if (!e || typeof e !== "object") continue;
      const from = String(e.from || "");
      const to = String(e.to || "");
      const rel = String(e.relation || "");
      const bad = [];
      if (from && !nodeSet.has(from)) bad.push("from");
      if (to && !nodeSet.has(to)) bad.push("to");
      if (bad.length) {
        out.push(
          findingStructural(
            "structural_graph_edge_dangling",
            "error",
            "Aresta do dependency-graph referencia nó inexistente.",
            { from: from || null, to: to || null, relation: rel || null, missing_endpoints: bad.sort() },
            [],
            { code: "structural_graph_edge_dangling", from, to, rel },
          ),
        );
      }
    }

    const fpRaw =
      depGraph.fingerprints && depGraph.fingerprints.graph_content_sha256 != null
        ? String(depGraph.fingerprints.graph_content_sha256)
        : "";
    const fpOk = /^[a-f0-9]{64}$/.test(fpRaw);
    if (!fpOk) {
      out.push(
        findingStructural(
          "structural_graph_fingerprint_invalid",
          "error",
          "dependency-graph: fingerprints.graph_content_sha256 ausente ou formato inválido (esperado sha256 hex 64).",
          { graph_fingerprint_sha256: fpRaw || null },
          [],
          { code: "structural_graph_fingerprint_invalid", fp: (fpRaw || "").slice(0, 16) },
        ),
      );
    } else {
      try {
        const computed = sha256HexUtf8(exportGraphDocCanonicalJson(depGraph));
        if (computed !== fpRaw) {
          out.push(
            findingStructural(
              "structural_graph_fingerprint_mismatch",
              "error",
              "dependency-graph: graph_content_sha256 não corresponde ao conteúdo canónico de nodes/edges.",
              { expected_prefix: computed.slice(0, 12), artifact_prefix: fpRaw.slice(0, 12) },
              [],
              { code: "structural_graph_fingerprint_mismatch", computed: computed.slice(0, 16) },
            ),
          );
        }
      } catch (_) {
        out.push(
          findingStructural(
            "structural_graph_fingerprint_mismatch",
            "warning",
            "Não foi possível verificar fingerprint do dependency-graph (erro ao canonicalizar).",
            {},
            [],
            { code: "structural_graph_fingerprint_mismatch", err: 1 },
          ),
        );
      }
    }
  }

  /** Targets / comandos / resultados (validation-plan + results) */
  const sortedResolvedCommandIds = (() => {
    const commands = planDoc && Array.isArray(planDoc.commands) ? planDoc.commands : [];
    return commands
      .filter((c) => c && typeof c === "object" && String(c.status || "") === "resolved")
      .map((c) => String(c.command_id || ""))
      .filter(Boolean)
      .sort((a, b) => a.localeCompare(b));
  })();

  const targetIdSet = new Set();
  const targetRows = planDoc && Array.isArray(planDoc.targets) ? planDoc.targets : [];
  for (const t of targetRows) {
    if (!t || typeof t !== "object") continue;
    const tid = String(t.target_id || "");
    if (tid) targetIdSet.add(tid);
  }

  if (planDoc && Array.isArray(planDoc.commands)) {
    for (const c of planDoc.commands) {
      if (!c || typeof c !== "object") continue;
      if (String(c.status || "") !== "resolved") continue;
      const tid = String(c.target_id || "");
      if (!tid) {
        out.push(
          findingStructural(
            "structural_resolved_command_unknown_target",
            "error",
            "Comando resolved sem target_id no validation-plan.",
            { command_id: String(c.command_id || "") },
            [],
            { code: "structural_resolved_command_unknown_target", command_id: String(c.command_id || "") },
          ),
        );
      } else if (!targetIdSet.has(tid)) {
        out.push(
          findingStructural(
            "structural_resolved_command_unknown_target",
            "error",
            `Comando resolved referencia target_id inexistente em plan.targets: ${tid}.`,
            { command_id: String(c.command_id || ""), target_id: tid },
            [tid],
            { code: "structural_resolved_command_unknown_target", command_id: String(c.command_id || ""), tid },
          ),
        );
      }
    }
  }

  if (projectRoot && planDoc && Array.isArray(planDoc.targets)) {
    for (const t of planDoc.targets) {
      if (!t || typeof t !== "object") continue;
      const tid = String(t.target_id || "");
      const fp = normalizePath(t.file != null ? String(t.file) : "");
      if (!fp) {
        out.push(
          findingStructural(
            "structural_target_file_missing",
            "warning",
            "Target no validation-plan sem campo file normalizável.",
            { target_id: tid || null },
            tid ? [tid] : [],
            { code: "structural_target_file_missing", target_id: tid, empty_file: true },
          ),
        );
        continue;
      }
      if (fp.includes("..")) {
        out.push(
          findingStructural(
            "structural_target_file_missing",
            "warning",
            "Target com path relativo inválido (..).",
            { target_id: tid || null, file: fp },
            tid ? [tid] : [],
            { code: "structural_target_file_missing", target_id: tid, file: fp },
          ),
        );
        continue;
      }
      const abs = path.join(projectRoot, fp.split("/").join(path.sep));
      let exists = false;
      try {
        exists = fs.existsSync(abs) && fs.statSync(abs).isFile();
      } catch (_) {
        exists = false;
      }
      if (!exists) {
        out.push(
          findingStructural(
            "structural_target_file_missing",
            "warning",
            `Ficheiro do target não existe no projectRoot: ${fp}.`,
            { target_id: tid || null, file: fp },
            tid ? [tid] : [],
            { code: "structural_target_file_missing", target_id: tid, file: fp },
          ),
        );
      }
    }
  }

  /** execution-plan: operações com file */
  if (projectRoot && execPlan && Array.isArray(execPlan.operations)) {
    for (const op of execPlan.operations) {
      if (!op || typeof op !== "object") continue;
      const fp = normalizePath(op.file != null ? String(op.file) : "");
      if (!fp) continue;
      if (fp.includes("..")) {
        out.push(
          findingStructural(
            "structural_referenced_file_missing",
            "warning",
            `execution-plan: operação com path inválido (..): ${fp}.`,
            { execution_plan_ref: EXECUTION_PLAN_FILENAME, file: fp },
            [],
            { code: "structural_referenced_file_missing", src: "execution_plan", file: fp },
          ),
        );
        continue;
      }
      const abs = path.join(projectRoot, fp.split("/").join(path.sep));
      let exists = false;
      try {
        exists = fs.existsSync(abs) && fs.statSync(abs).isFile();
      } catch (_) {
        exists = false;
      }
      if (!exists) {
        out.push(
          findingStructural(
            "structural_referenced_file_missing",
            "warning",
            `execution-plan referencia ficheiro ausente no repositório: ${fp}.`,
            { execution_plan_ref: EXECUTION_PLAN_FILENAME, file: fp },
            [],
            { code: "structural_referenced_file_missing", src: "execution_plan_file", file: fp },
          ),
        );
      }
    }
  }

  const resultsPath = path.join(outputDir, VALIDATION_RESULTS_FILENAME);
  let resultsPresent = false;
  try {
    resultsPresent = Boolean(outputDir && fs.existsSync(resultsPath));
  } catch (_) {
    resultsPresent = false;
  }

  if (sortedResolvedCommandIds.length > 0 && !resultsPresent) {
    out.push(
      findingStructural(
        "structural_resolved_requires_results_artifact",
        "error",
        "Comandos resolved no validation-plan exigem validation-results.json presente.",
        { resolved_command_count: sortedResolvedCommandIds.length, resolved_command_ids: compactList(sortedResolvedCommandIds) },
        [],
        { code: "structural_resolved_requires_results_artifact", n: sortedResolvedCommandIds.length },
      ),
    );
  }

  if (resultsPresent && resultsDoc && Array.isArray(resultsDoc.results) && sortedResolvedCommandIds.length > 0) {
    const resultIds = resultsDoc.results
      .map((r) => (r && r.command_id != null ? String(r.command_id) : ""))
      .filter(Boolean);
    const uniq = new Set(resultIds);
    const missing = sortedResolvedCommandIds.filter((id) => !uniq.has(id));
    if (missing.length > 0) {
      out.push(
        findingStructural(
          "structural_resolved_missing_result_rows",
          "error",
          "validation-results.json não contém linhas para todos os comandos resolved.",
          {
            missing_command_ids: compactList(missing),
            results_row_count: resultsDoc.results.length,
          },
          [],
          { code: "structural_resolved_missing_result_rows", missing: compactList(missing) },
        ),
      );
    }
  }

  if (planDoc && Array.isArray(planDoc.commands) && resultsDoc && Array.isArray(resultsDoc.results)) {
    const planCmdIds = new Set(
      planDoc.commands.map((c) => (c && c.command_id != null ? String(c.command_id) : "")).filter(Boolean),
    );
    for (const row of resultsDoc.results) {
      if (!row || typeof row !== "object") continue;
      const cid = String(row.command_id || "");
      if (!cid) continue;
      if (!planCmdIds.has(cid)) {
        const rt = row.target_id ? [String(row.target_id)] : [];
        out.push(
          findingStructural(
            "structural_result_orphan_command",
            "warning",
            "Linha em validation-results referencia command_id ausente no validation-plan.",
            { command_id: cid },
            rt,
            { code: "structural_result_orphan_command", command_id: cid },
          ),
        );
      }
    }
  }

  return out;
}

module.exports = {
  collectStructuralDeterministicFindings,
  resolveProjectRootBestEffort,
};