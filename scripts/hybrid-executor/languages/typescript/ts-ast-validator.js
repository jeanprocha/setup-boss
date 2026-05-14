const { validateJavaScriptAst } = require("../javascript/js-ast-validator");

/**
 * Árvore Babel TS é File/Program igual a JS para validação básica.
 * @param {unknown} ast
 * @returns {{ ok: boolean, reason?: string }}
 */
function validateTypeScriptAst(ast) {
  return validateJavaScriptAst(ast);
}

module.exports = { validateTypeScriptAst };
