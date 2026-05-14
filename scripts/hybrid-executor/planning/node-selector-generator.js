const crypto = require("crypto");

/**
 * Ordenação determinística das chaves de um objeto shallow.
 */
function stableShallowPairs(obj) {
  if (!obj || typeof obj !== "object") return [];
  const keys = Object.keys(obj).sort();
  return keys.map((k) => [k, obj[k]]);
}

/**
 * Sérialização canonical simples para fingerprint (valor JSON por chave ordenada).
 * @param {unknown} sel
 */
function canonicalSelectorWire(sel) {
  if (sel === null || sel === undefined) return JSON.stringify(sel);
  if (typeof sel !== "object") return JSON.stringify(sel);
  if (Array.isArray(sel)) return `[${sel.map((x) => canonicalSelectorWire(x)).join(",")}]`;
  const pairs = stableShallowPairs(sel);
  return `{${pairs.map(([k, v]) => `${JSON.stringify(k)}:${canonicalSelectorWire(v)}`).join(",")}}`;
}

function fingerprintSelector(sel) {
  return crypto.createHash("sha256").update(canonicalSelectorWire(sel), "utf8").digest("hex").slice(0, 32);
}

/** @param {object} imp */
function importDeclarationSelector(node) {
  const src =
    node && node.source && node.source.type === "StringLiteral" ? String(node.source.value) : "";
  return {
    selector_strategy: "import_declaration_source_value",
    source_value: src,
    import_kind: node && node.importKind ? String(node.importKind) : "value",
  };
}

/** @param {object} ex */
function exportNamedDeclarationSelector(node) {
  const specs = Array.isArray(node.specifiers)
    ? node.specifiers
        .map((spec) => {
          const exportedName =
            spec && spec.exported && spec.exported.name != null ? String(spec.exported.name) : "";

          const localRaw =
            spec && spec.local && spec.local.name != null ? String(spec.local.name) : "";

          let token = "";

          if (exportedName && localRaw && exportedName !== localRaw) token = `${localRaw}->${exportedName}`;
          else token = exportedName || localRaw;

          return token;
        })
        .filter(Boolean)
        .sort()
    : [];
  const outNames = [...new Set(specs)];
  const kind = node && node.exportKind ? String(node.exportKind) : "value";

  /** @type {any} */
  const decl = node && node.declaration;
  let declarator_heads = [];

  if (decl && decl.type === "VariableDeclaration") {
    declarator_heads = declaratorHintsFromVariableDeclaration(decl).sort();
  } else if (decl && typeof decl.type === "string") {
    const id = declaratorLikeName(decl);
    if (id) declarator_heads = [id].sort();
  }

  const base = {
    selector_strategy: "export_named_declaration",
    export_kind: kind,
    specifier_names_sorted: outNames,
  };

  return declarator_heads.length
    ? { ...base, declaration_variable_names_sorted: declarator_heads }
    : base;
}

function declaratorLikeName(decl) {
  if (!decl || typeof decl !== "object") return null;
  const id =
    decl.type === "FunctionDeclaration" || decl.type === "ClassDeclaration"
      ? decl.id
      : null;
  if (id && id.name) return String(id.name);
  return null;
}

function declaratorHintsFromVariableDeclaration(vd) {
  if (!vd || vd.type !== "VariableDeclaration") return [];

  /** @type {string[]} */
  const out = [];
  const decs = Array.isArray(vd.declarations) ? vd.declarations : [];

  for (const d of decs) {
    if (!d || !d.id) continue;
    if (d.id.type === "Identifier" && d.id.name) {
      out.push(String(d.id.name));
    }
  }

  return out;
}

/** @param {object} vd */
function variableDeclarationSelector(node) {
  const kind = node && node.kind ? String(node.kind) : "";
  const names = declaratorHintsFromVariableDeclaration(node);
  const sorted = [...new Set(names)].sort();

  return {
    selector_strategy: "variable_declaration",
    declaration_kind: kind,
    binding_names_sorted: sorted,
    declarator_count: Array.isArray(node.declarations) ? node.declarations.length : 0,
  };
}

/** @param {object} fn */
function functionDeclarationSelector(node) {
  const name =
    node && node.id && node.id.type === "Identifier" && node.id.name
      ? String(node.id.name)
      : "";
  return {
    selector_strategy: function_name_strategy(name ? "named" : "anonymous"),
    function_name: name || null,
    async_bool: Boolean(node.async),
    generator_bool: Boolean(node.generator),
  };
}

/** @param {object} klass */
function classDeclarationSelector(node) {
  const name =
    node && node.id && node.id.type === "Identifier" && node.id.name ? String(node.id.name) : "";
  return {
    selector_strategy: class_name_strategy(name ? "named" : "anonymous"),
    class_name: name || null,
  };
}

function function_name_strategy(k) {
  return k === "named" ? "function_declaration_id" : "function_declaration_anonymous";
}

function class_name_strategy(k) {
  return k === "named" ? "class_declaration_id" : "class_declaration_anonymous";
}

/** @typedef {{ deterministic_selector: object, selector_fingerprint: string }} GeneratedSelectorRow */

/** @returns {GeneratedSelectorRow|null} */
function generateSelectorForAstNode(kind, node) {
  if (!node || typeof node !== "object") return null;

  let sel;

  switch (kind) {
    case "ImportDeclaration":
      sel = importDeclarationSelector(node);
      break;
    case "ExportNamedDeclaration":
      sel = exportNamedDeclarationSelector(node);
      break;
    case "VariableDeclaration":
      sel = variableDeclarationSelector(node);
      break;
    case "FunctionDeclaration":
      sel = functionDeclarationSelector(node);
      break;
    case "ClassDeclaration":
      sel = classDeclarationSelector(node);
      break;
    default:
      return null;
  }

  return {
    deterministic_selector: sel,
    selector_fingerprint: fingerprintSelector(sel),
  };
}

module.exports = {
  generateSelectorForAstNode,
  fingerprintSelector,
};
