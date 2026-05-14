/**
 * Validação AST mínima (read-only).
 * @param {unknown} ast
 * @returns {{ ok: boolean, reason?: string }}
 */
function validateJavaScriptAst(ast) {
  if (!ast || typeof ast !== "object") {
    return { ok: false, reason: "ast_missing" };
  }
  const t = /** @type {{ type?: string, program?: unknown }} */ (ast);
  if (t.type !== "File" || !t.program || typeof t.program !== "object") {
    return { ok: false, reason: "not_babel_file_root" };
  }
  const p = /** @type {{ type?: string, body?: unknown }} */ (t.program);
  if (p.type !== "Program" || !Array.isArray(p.body)) {
    return { ok: false, reason: "invalid_program" };
  }
  return { ok: true };
}

module.exports = { validateJavaScriptAst };
