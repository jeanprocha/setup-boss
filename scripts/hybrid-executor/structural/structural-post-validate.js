"use strict";

const path = require("path");
const { detectStructuralLanguage } = require("../languages/language-detector");
const { isLanguageEnabledForStructural } = require("../feature-flags");
const { parseJavaScript } = require("../languages/javascript/js-parser");
const { validateJavaScriptAst } = require("../languages/javascript/js-ast-validator");
const { parseTypeScript } = require("../languages/typescript/ts-parser");
const { validateTypeScriptAst } = require("../languages/typescript/ts-ast-validator");

const SHADOW_REPLACE_NODE_KINDS = new Set([
  "ImportDeclaration",
  "VariableDeclaration",
  "FunctionDeclaration",
]);

/**
 * Validação pós-apply estrutural: integridade fora do span, reparse e AST mínima.
 * @param {{
 *   before: string,
 *   after: string,
 *   planEntry: object|null,
 *   relativePath: string,
 * }} o
 * @returns {{ ok: boolean, reasons: string[], parse_error?: string, ast_ok?: boolean }}
 */
function postValidateStructuralResult(o) {
  const reasons = [];
  const before = String(o.before ?? "");
  const after = String(o.after ?? "");
  const planEntry = o.planEntry;
  const relativePath = o.relativePath;

  const ns = planEntry?.node_span;

  if (
    !ns ||
    typeof ns.start !== "number" ||
    typeof ns.end !== "number" ||
    ns.end <= ns.start
  ) {
    return { ok: false, reasons: ["post_validate_invalid_node_span"] };
  }

  const innerOldLen = ns.end - ns.start;
  const innerNewLen = innerOldLen + (after.length - before.length);

  if (innerNewLen < 0) {
    return { ok: false, reasons: ["post_validate_inner_length_inconsistent"] };
  }

  if (after.slice(0, ns.start) !== before.slice(0, ns.start)) {
    reasons.push("formatter_drift_prefix_outside_span");
  }

  const suffAfter = after.slice(ns.start + innerNewLen);
  const suffBefore = before.slice(ns.end);

  if (suffAfter !== suffBefore) {
    reasons.push("formatter_drift_suffix_outside_span");
  }

  const kind = planEntry.node_kind ? String(planEntry.node_kind) : "";

  if (kind && !SHADOW_REPLACE_NODE_KINDS.has(kind)) {
    reasons.push("node_kind_not_supported_for_structural_apply");
  }

  if (reasons.length) {
    return { ok: false, reasons };
  }

  const lang = detectStructuralLanguage(relativePath);

  if (!lang) {
    return { ok: false, reasons: ["language_unknown_for_reparse"] };
  }

  if (!isLanguageEnabledForStructural(lang)) {
    return { ok: false, reasons: ["language_disabled_for_structural"] };
  }

  const ext = path.extname(String(relativePath || "")).toLowerCase();
  const isJsx = ext === ".jsx" || ext === ".tsx";

  const parsed =
    lang === "typescript"
      ? parseTypeScript(after, relativePath)
      : parseJavaScript(after, { isJsx });

  if (parsed.error) {
    return {
      ok: false,
      reasons: ["ast_reparse_failed"],
      parse_error: parsed.error.message,
      ast_ok: false,
    };
  }

  const val =
    lang === "typescript"
      ? validateTypeScriptAst(parsed.ast)
      : validateJavaScriptAst(parsed.ast);

  if (!val.ok) {
    return {
      ok: false,
      reasons: [val.reason ? `ast_invalid:${val.reason}` : "ast_invalid"],
      ast_ok: false,
    };
  }

  return { ok: true, reasons: [], ast_ok: true };
}

module.exports = {
  postValidateStructuralResult,
  SHADOW_REPLACE_NODE_KINDS,
};
