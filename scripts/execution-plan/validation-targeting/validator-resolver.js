/**
 * Fase 4.10.2 — Resolve descriptors do validation-plan em comandos (metadata apenas; não executa).
 */

"use strict";

const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const { stableStringify, sha256HexUtf8 } = require("../fingerprint/plan-fingerprint");
const { normalizePath } = require("../normalization/operation-normalizer");
const { DEFAULT_VALIDATOR_CLI_SPECS } = require("../validation/validation-registry");

const RESOLVER_SCHEMA_CONTRACT = "validation-plan-resolver/1";
const RESOLVER_SCHEMA_VERSION = 1;

function resolveProjectRootFromOutputDir(outputDir) {
  const metaPath = path.join(String(outputDir || ""), "metadata.json");
  try {
    if (!fs.existsSync(metaPath)) return null;
    const meta = JSON.parse(fs.readFileSync(metaPath, "utf8"));
    const r = meta.projectRoot != null ? String(meta.projectRoot).trim() : "";
    return r || null;
  } catch (_) {
    return null;
  }
}

function loadPackageJson(projectRoot) {
  const root = projectRoot && String(projectRoot).trim();
  if (!root) return null;
  const p = path.join(root, "package.json");
  try {
    if (!fs.existsSync(p)) return null;
    return JSON.parse(fs.readFileSync(p, "utf8"));
  } catch (_) {
    return null;
  }
}

/**
 * Extrai apenas chaves/versões relevantes ao resolver — ordenação determinística.
 */
function fingerprintPackageJsonDepsForResolver(pkg) {
  if (!pkg || typeof pkg !== "object") return {};
  /** @type {Record<string,string>} */
  const out = {};
  const merged = {
    ...(pkg.dependencies && typeof pkg.dependencies === "object" ? pkg.dependencies : {}),
    ...(pkg.devDependencies && typeof pkg.devDependencies === "object" ? pkg.devDependencies : {}),
  };
  for (const k of Object.keys(merged).sort((a, b) => a.localeCompare(b))) {
    const kl = k.toLowerCase();
    if (
      kl === "jest" ||
      kl === "vitest" ||
      kl === "eslint" ||
      kl === "typescript" ||
      kl.startsWith("@typescript-eslint/") ||
      kl.startsWith("eslint") ||
      kl.includes("jest") ||
      kl.includes("vitest")
    ) {
      out[k] = String(merged[k] != null ? merged[k] : "");
    }
  }
  return out;
}

/**
 * @returns {{ dispatch: 'jest'|'vitest'|'both'|'neither', jest_signal: boolean, vitest_signal: boolean }}
 */
function detectJestVitestSignals(pkg) {
  if (!pkg || typeof pkg !== "object") {
    return { dispatch: "neither", jest_signal: false, vitest_signal: false };
  }
  const merged = {
    ...(pkg.dependencies && typeof pkg.dependencies === "object" ? pkg.dependencies : {}),
    ...(pkg.devDependencies && typeof pkg.devDependencies === "object" ? pkg.devDependencies : {}),
  };
  const keys = Object.keys(merged);
  const jest_signal =
    Object.prototype.hasOwnProperty.call(merged, "jest") ||
    keys.some((k) => k.toLowerCase().startsWith("@jest/")) ||
    keys.some(
      (k) => k.toLowerCase() === "babel-jest" || k.toLowerCase() === "ts-jest",
    );
  const vitest_signal = Object.prototype.hasOwnProperty.call(merged, "vitest");
  let dispatch = "neither";
  if (jest_signal && vitest_signal) dispatch = "both";
  else if (jest_signal) dispatch = "jest";
  else if (vitest_signal) dispatch = "vitest";
  return { dispatch, jest_signal, vitest_signal };
}

function argvToDisplayCommand(argv) {
  return argv
    .map((a) => {
      const s = String(a);
      return /\s/.test(s) ? JSON.stringify(s) : s;
    })
    .join(" ");
}

function stableCommandId(planId, runId, targetId, descriptorId, argv) {
  const payload = [
    String(planId || ""),
    String(runId || ""),
    String(targetId || ""),
    String(descriptorId || ""),
    JSON.stringify(argv),
  ].join("\u001f");
  return `vc-${crypto.createHash("sha256").update(payload, "utf8").digest("hex").slice(0, 16)}`;
}

const SUPPORTED_DESCRIPTORS = new Set([
  "eslint",
  "jest_or_vitest",
  "typescript",
  "typescript_project_refs",
]);

/**
 * @param {object} planDoc
 * @param {string} outputDir
 * @returns {{ resolved_validators: object[], commands: object[], resolver: object }}
 */
function resolveValidatorCommands(planDoc, outputDir) {
  const planId =
    planDoc && planDoc.metadata && planDoc.metadata.plan_id != null
      ? String(planDoc.metadata.plan_id)
      : "";
  const runId =
    planDoc && planDoc.metadata && planDoc.metadata.run_id != null
      ? String(planDoc.metadata.run_id)
      : "";

  const projectRoot = resolveProjectRootFromOutputDir(outputDir);
  const pkg = loadPackageJson(projectRoot);
  const depSlice = fingerprintPackageJsonDepsForResolver(pkg);
  const package_json_fingerprint_sha256 = sha256HexUtf8(stableStringify(depSlice));
  const { dispatch: jest_vitest_dispatch } = detectJestVitestSignals(pkg);

  const project_root_posix = projectRoot ? projectRoot.replace(/\\/g, "/") : null;

  /** @type {object[]} */
  const commands = [];
  /** @type {Map<string, { resolver_key: string, descriptor_ids: Set<string>, status: string }>} */
  const catalog = new Map();

  /**
   * @param {string} resolverKey
   * @param {string} descriptorId
   */
  function touchResolved(resolverKey, descriptorId) {
    const k = String(resolverKey);
    let slot = catalog.get(k);
    if (!slot) {
      slot = { resolver_key: k, descriptor_ids: new Set(), resolved: false };
      catalog.set(k, slot);
    }
    slot.descriptor_ids.add(String(descriptorId));
    slot.resolved = true;
  }

  /** @type {{ descriptor_ids: Set<string> } | null} */
  let jestOrVitestBlocker = null;

  /**
   * @param {string} descriptorId
   * @param {'both'|'neither'} reasonGroup
   */
  function touchJestOrVitestBlocker(descriptorId, reasonGroup) {
    jestOrVitestBlocker ??= {
      descriptor_ids: new Set(),
      reason_group: reasonGroup,
    };
    jestOrVitestBlocker.descriptor_ids.add(String(descriptorId));
  }

  const targets = Array.isArray(planDoc.targets)
    ? [...planDoc.targets].sort((a, b) =>
        String(a.target_id).localeCompare(String(b.target_id)),
      )
    : [];

  for (const t of targets) {
    if (!t || typeof t !== "object") continue;
    const targetId = String(t.target_id || "");
    const consolidationKey = String(t.consolidation_key || "");
    const file = t.file != null ? normalizePath(t.file) : null;
    const descriptors = Array.isArray(t.inferred_validators)
      ? [...t.inferred_validators].sort((a, b) => String(a).localeCompare(String(b)))
      : [];

    for (const descriptorId of descriptors) {
      const d = String(descriptorId);
      if (!SUPPORTED_DESCRIPTORS.has(d)) {
        commands.push({
          command_id: stableCommandId(planId, runId, targetId, d, ["__unresolved__"]),
          target_id: targetId,
          consolidation_key: consolidationKey,
          descriptor_id: d,
          validator_id: null,
          status: "unresolved",
          reason: "resolver_not_supported",
          command: null,
          argv: null,
          runtime: "unknown",
          scope_support: "unknown",
          capabilities: [],
        });
        continue;
      }

      if (d === "eslint") {
        if (!file) {
          commands.push({
            command_id: stableCommandId(planId, runId, targetId, d, ["eslint", "no_file"]),
            target_id: targetId,
            consolidation_key: consolidationKey,
            descriptor_id: d,
            validator_id: "eslint",
            status: "unresolved",
            reason: "missing_target_file",
            command: null,
            argv: null,
            runtime: "node",
            scope_support: "targeted",
            capabilities: ["lint_paths"],
          });
          continue;
        }
        const argv = ["npx", "eslint", "--no-error-on-unmatched-pattern", file];
        touchResolved("eslint", d);
        commands.push({
          command_id: stableCommandId(planId, runId, targetId, d, argv),
          target_id: targetId,
          consolidation_key: consolidationKey,
          descriptor_id: d,
          validator_id: "eslint",
          status: "resolved",
          reason: null,
          command: argvToDisplayCommand(argv),
          argv,
          runtime: "node",
          scope_support: "targeted",
          capabilities: ["lint_paths"],
        });
        continue;
      }

      if (d === "jest_or_vitest") {
        if (jest_vitest_dispatch === "both") {
          touchJestOrVitestBlocker(d, "both");
          commands.push({
            command_id: stableCommandId(planId, runId, targetId, d, ["ambiguous"]),
            target_id: targetId,
            consolidation_key: consolidationKey,
            descriptor_id: d,
            validator_id: null,
            status: "unresolved",
            reason: "jest_and_vitest_both_present",
            command: null,
            argv: null,
            runtime: "node",
            scope_support: "targeted",
            capabilities: ["test_single_path"],
          });
          continue;
        }
        if (jest_vitest_dispatch === "neither") {
          touchJestOrVitestBlocker(d, "neither");
          commands.push({
            command_id: stableCommandId(planId, runId, targetId, d, ["no_runner"]),
            target_id: targetId,
            consolidation_key: consolidationKey,
            descriptor_id: d,
            validator_id: null,
            status: "unresolved",
            reason: "no_jest_or_vitest_dependency",
            command: null,
            argv: null,
            runtime: "node",
            scope_support: "targeted",
            capabilities: ["test_single_path"],
          });
          continue;
        }
        if (!file) {
          commands.push({
            command_id: stableCommandId(planId, runId, targetId, d, [
              jest_vitest_dispatch,
              "no_file",
            ]),
            target_id: targetId,
            consolidation_key: consolidationKey,
            descriptor_id: d,
            validator_id: jest_vitest_dispatch === "jest" ? "jest" : "vitest",
            status: "unresolved",
            reason: "missing_target_file",
            command: null,
            argv: null,
            runtime: "node",
            scope_support: "targeted",
            capabilities: ["test_single_path"],
          });
          continue;
        }
        if (jest_vitest_dispatch === "jest") {
          const argv = ["npx", "jest", "--passWithNoTests", "--runTestsByPath", file];
          touchResolved("jest", d);
          commands.push({
            command_id: stableCommandId(planId, runId, targetId, d, argv),
            target_id: targetId,
            consolidation_key: consolidationKey,
            descriptor_id: d,
            validator_id: "jest",
            status: "resolved",
            reason: null,
            command: argvToDisplayCommand(argv),
            argv,
            runtime: "node",
            scope_support: "targeted",
            capabilities: ["test_single_path"],
          });
        } else {
          const argv = ["npx", "vitest", "run", "--passWithNoTests", file];
          touchResolved("vitest", d);
          commands.push({
            command_id: stableCommandId(planId, runId, targetId, d, argv),
            target_id: targetId,
            consolidation_key: consolidationKey,
            descriptor_id: d,
            validator_id: "vitest",
            status: "resolved",
            reason: null,
            command: argvToDisplayCommand(argv),
            argv,
            runtime: "node",
            scope_support: "targeted",
            capabilities: ["test_single_path"],
          });
        }
        continue;
      }

      if (d === "typescript" || d === "typescript_project_refs") {
        const argv = ["npx", "tsc", "--noEmit", "--skipLibCheck", "--pretty", "false"];
        touchResolved("tsc", d);
        commands.push({
          command_id: stableCommandId(planId, runId, targetId, d, argv),
          target_id: targetId,
          consolidation_key: consolidationKey,
          descriptor_id: d,
          validator_id: "tsc",
          status: "resolved",
          reason: null,
          command: argvToDisplayCommand(argv),
          argv,
          runtime: "node",
          scope_support: "project_wide",
          capabilities: ["typecheck_project"],
        });
      }
    }
  }

  commands.sort((a, b) => String(a.command_id).localeCompare(String(b.command_id)));

  /** @type {object[]} */
  const resolved_validators = [];

  for (const spec of [...DEFAULT_VALIDATOR_CLI_SPECS].sort((a, b) =>
    a.resolver_key.localeCompare(b.resolver_key),
  )) {
    const slot = catalog.get(spec.resolver_key);
    if (!slot || !slot.resolved) continue;

    const descriptor_ids_served = [...slot.descriptor_ids].sort((a, b) => a.localeCompare(b));
    resolved_validators.push({
      validator_id: spec.resolver_key,
      resolver_key: spec.resolver_key,
      status: "resolved",
      reason: null,
      runtime: spec.runtime_default,
      scope_support: spec.default_scope_support,
      capabilities: [...spec.default_capabilities],
      descriptor_ids_served,
    });
  }

  if (jestOrVitestBlocker) {
    const desc = [...jestOrVitestBlocker.descriptor_ids].sort((a, b) => a.localeCompare(b));
    resolved_validators.push({
      validator_id: "jest_or_vitest",
      resolver_key: "jest_or_vitest",
      status: "unresolved",
      reason:
        jestOrVitestBlocker.reason_group === "both"
          ? "jest_and_vitest_both_present"
          : "no_jest_or_vitest_dependency",
      runtime: "node",
      scope_support: "targeted",
      capabilities: [],
      descriptor_ids_served: desc.length ? desc : ["jest_or_vitest"],
    });
  }

  resolved_validators.sort((a, b) => {
    const rk = String(a.resolver_key).localeCompare(String(b.resolver_key));
    if (rk !== 0) return rk;
    return String(a.status).localeCompare(String(b.status));
  });

  const resolverMeta = {
    schema_contract: RESOLVER_SCHEMA_CONTRACT,
    schema_version: RESOLVER_SCHEMA_VERSION,
    project_root_posix,
    package_json_present: Boolean(pkg),
    package_json_fingerprint_sha256,
    jest_vitest_dispatch,
    known_resolver_keys: DEFAULT_VALIDATOR_CLI_SPECS.map((s) => s.resolver_key).sort((a, b) =>
      a.localeCompare(b),
    ),
  };

  return {
    resolved_validators,
    commands,
    resolver: resolverMeta,
  };
}

/**
 * @param {{ resolved_validators: object[], commands: object[], resolver: object }} resolution
 */
function computeValidatorResolutionFingerprint(resolution) {
  const canonical = {
    resolved_validators: resolution.resolved_validators,
    commands: resolution.commands,
    resolver: {
      schema_version: resolution.resolver.schema_version,
      package_json_fingerprint_sha256: resolution.resolver.package_json_fingerprint_sha256,
      jest_vitest_dispatch: resolution.resolver.jest_vitest_dispatch,
      package_json_present: resolution.resolver.package_json_present,
    },
  };
  return sha256HexUtf8(stableStringify(canonical));
}

const VALIDATION_PLAN_SOURCES_IDENTITY_KEYS = [
  "validation_targets",
  "validation_manifest",
  "validation_propagation_manifest",
  "executor_changes",
  "execution_plan",
];

function sourcesForValidationPlanIdentity(planDoc) {
  const s = planDoc.sources && typeof planDoc.sources === "object" ? planDoc.sources : {};
  /** @type {Record<string, unknown>} */
  const out = {};
  for (const k of VALIDATION_PLAN_SOURCES_IDENTITY_KEYS) {
    if (Object.prototype.hasOwnProperty.call(s, k)) out[k] = s[k];
  }
  return out;
}

/**
 * @param {object} planDoc — documento completo (após merge do resolver)
 */
function computeValidationPlanIdentityPayload(planDoc) {
  return {
    schema_contract: planDoc.schema_contract,
    version: planDoc.version,
    plan_id: planDoc.metadata && planDoc.metadata.plan_id != null ? String(planDoc.metadata.plan_id) : "",
    run_id: planDoc.metadata && planDoc.metadata.run_id != null ? String(planDoc.metadata.run_id) : "",
    generation_phase:
      planDoc.metadata && planDoc.metadata.generation_phase != null
        ? String(planDoc.metadata.generation_phase)
        : "",
    targets: planDoc.targets,
    validators: planDoc.validators,
    resolved_validators: planDoc.resolved_validators || [],
    commands: planDoc.commands || [],
    resolver_summary: planDoc.resolver
      ? {
          schema_version: planDoc.resolver.schema_version,
          jest_vitest_dispatch: planDoc.resolver.jest_vitest_dispatch,
          package_json_fingerprint_sha256: planDoc.resolver.package_json_fingerprint_sha256,
        }
      : null,
    scope: planDoc.scope,
    sources: sourcesForValidationPlanIdentity(planDoc),
    executor_changes_digest_sha256:
      planDoc.fingerprints && planDoc.fingerprints.executor_changes_digest_sha256,
    validation_targets_snapshot_sha256:
      planDoc.fingerprints && planDoc.fingerprints.validation_targets_snapshot_sha256,
    semantic_propagation_fingerprint_sha256:
      planDoc.fingerprints && planDoc.fingerprints.semantic_propagation_fingerprint_sha256,
    plan_fingerprint_sha256:
      planDoc.fingerprints && planDoc.fingerprints.plan_fingerprint_sha256,
  };
}

module.exports = {
  RESOLVER_SCHEMA_CONTRACT,
  RESOLVER_SCHEMA_VERSION,
  resolveValidatorCommands,
  computeValidatorResolutionFingerprint,
  computeValidationPlanIdentityPayload,
  sourcesForValidationPlanIdentity,
  VALIDATION_PLAN_SOURCES_IDENTITY_KEYS,
  resolveProjectRootFromOutputDir,
  loadPackageJson,
  fingerprintPackageJsonDepsForResolver,
  detectJestVitestSignals,
  SUPPORTED_DESCRIPTORS,
};
