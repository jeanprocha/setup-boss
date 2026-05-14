const path = require("path");
const babel = require("@babel/parser");

/**
 * @param {string} source
 * @param {string} filePathHint — relativ path para inferir JSX (tsx).
 * @param {{ ranges?: boolean }} [opts]
 * @returns {{ ast: import("@babel/types").File | null, error: Error | null }}
 */
function parseTypeScript(source, filePathHint = "", opts = {}) {
  const ext = path.extname(String(filePathHint)).toLowerCase();
  const isTsx = ext === ".tsx";
  try {
    const ast = babel.parse(String(source || ""), {
      sourceType: "unambiguous",
      allowReturnOutsideFunction: true,
      allowAwaitOutsideFunction: true,
      errorRecovery: false,
      ranges: Boolean(opts.ranges),
      plugins: [
        "typescript",
        ...(isTsx ? ["jsx"] : []),
        "classProperties",
        "classPrivateProperties",
        "classPrivateMethods",
        "optionalChaining",
        "nullishCoalescingOperator",
        "topLevelAwait",
        "importAttributes",
        "dynamicImport",
      ],
    });
    return { ast, error: null };
  } catch (e) {
    return { ast: null, error: e instanceof Error ? e : new Error(String(e)) };
  }
}

module.exports = { parseTypeScript };
