/**
 * Registry extensível: validações estruturais do plano + metadados de CLI para resolução (Fase 4.10.2).
 * Não executa comandos.
 */

/** @typedef {{ code: string, message: string, path?: string|null }} PlanValidationIssue */

/**
 * @param {string} id
 * @param {(plan: object) => PlanValidationIssue[]} fn
 */
function createStructuralValidator(id, fn) {
  return { id, validate: fn };
}

/** @type {ReturnType<createStructuralValidator>[]} */
const DEFAULT_STRUCTURAL_VALIDATORS = [];

/**
 * Metadados mínimos por ferramenta CLI resolvível (determinístico; evoluível).
 * O motor de execução (fases posteriores) usa estes registos opcionalmente.
 *
 * @typedef {{
 *   resolver_key: string,
 *   display_name?: string,
 *   runtime_default: string,
 *   default_scope_support: 'targeted'|'project_wide'|'unresolved_default',
 *   default_capabilities: string[],
 *   maps_from_descriptor_ids: string[],
 * }} ValidatorCliResolverSpec
 */

/** @type {readonly ValidatorCliResolverSpec[]} */
const DEFAULT_VALIDATOR_CLI_SPECS = Object.freeze([
  {
    resolver_key: "eslint",
    display_name: "ESLint",
    runtime_default: "node",
    default_scope_support: "targeted",
    default_capabilities: ["lint_paths"],
    maps_from_descriptor_ids: ["eslint"],
  },
  {
    resolver_key: "jest",
    display_name: "Jest",
    runtime_default: "node",
    default_scope_support: "targeted",
    default_capabilities: ["test_single_path"],
    maps_from_descriptor_ids: ["jest_or_vitest"],
  },
  {
    resolver_key: "vitest",
    display_name: "Vitest",
    runtime_default: "node",
    default_scope_support: "targeted",
    default_capabilities: ["test_single_path"],
    maps_from_descriptor_ids: ["jest_or_vitest"],
  },
  {
    resolver_key: "tsc",
    display_name: "TypeScript compiler",
    runtime_default: "node",
    default_scope_support: "project_wide",
    default_capabilities: ["typecheck_project"],
    maps_from_descriptor_ids: ["typescript", "typescript_project_refs"],
  },
]);

/**
 * Mapa rápido descriptor_id inferido → router (jest_or_vitest precisa despacho especial).
 */
const DESCRIPTOR_TO_RESOLVER_KEY = {};
for (const spec of DEFAULT_VALIDATOR_CLI_SPECS) {
  for (const d of spec.maps_from_descriptor_ids) {
    if (d === "jest_or_vitest") continue;
    if (!DESCRIPTOR_TO_RESOLVER_KEY[d]) DESCRIPTOR_TO_RESOLVER_KEY[d] = spec.resolver_key;
  }
}

/**
 * Factório para novos registos CLI (consumo futuro / extensões fora da lista DEFAULT).
 * @param {ValidatorCliResolverSpec} spec
 * @returns {Readonly<ValidatorCliResolverSpec>}
 */
function createValidatorCliResolverSpec(spec) {
  const caps = Array.isArray(spec.default_capabilities)
    ? [...spec.default_capabilities].map(String).sort((a, b) => a.localeCompare(b))
    : [];
  const ids = [...(spec.maps_from_descriptor_ids || [])].map(String).sort((a, b) => a.localeCompare(b));
  const scope =
    spec.default_scope_support === "project_wide"
      ? "project_wide"
      : spec.default_scope_support === "unresolved_default"
        ? "unresolved_default"
        : "targeted";
  return Object.freeze({
    resolver_key: String(spec.resolver_key || ""),
    display_name:
      spec.display_name != null && String(spec.display_name).trim() !== ""
        ? String(spec.display_name)
        : String(spec.resolver_key || ""),
    runtime_default:
      spec.runtime_default != null && String(spec.runtime_default).trim() !== ""
        ? String(spec.runtime_default)
        : "node",
    default_scope_support: scope,
    default_capabilities: Object.freeze(caps),
    maps_from_descriptor_ids: Object.freeze(ids),
  });
}

function getValidatorCliSpecByResolverKey(resolverKey) {
  const k = String(resolverKey || "");
  return DEFAULT_VALIDATOR_CLI_SPECS.find((s) => s.resolver_key === k) || null;
}

function listSupportedResolverKeys() {
  return DEFAULT_VALIDATOR_CLI_SPECS.map((s) => s.resolver_key).sort((a, b) => a.localeCompare(b));
}

module.exports = {
  createStructuralValidator,
  createValidatorCliResolverSpec,
  DEFAULT_STRUCTURAL_VALIDATORS,
  DEFAULT_VALIDATOR_CLI_SPECS,
  DESCRIPTOR_TO_RESOLVER_KEY,
  getValidatorCliSpecByResolverKey,
  listSupportedResolverKeys,
};
