const babel = require("@babel/parser");

/**
 * @param {string} source
 * @param {{ isJsx?: boolean }} [opts]
 * @returns {{ ast: import("@babel/types").File | null, error: Error | null }}
 */
function parseJavaScript(source, opts = {}) {
  const isJsx = Boolean(opts.isJsx);
  try {
    const ast = babel.parse(String(source || ""), {
      sourceType: "unambiguous",
      allowReturnOutsideFunction: true,
      allowAwaitOutsideFunction: true,
      errorRecovery: false,
      ranges: Boolean(opts.ranges),
      plugins: [
        "classProperties",
        "classPrivateProperties",
        "classPrivateMethods",
        "optionalChaining",
        "nullishCoalescingOperator",
        "topLevelAwait",
        "importAttributes",
        "dynamicImport",
        ...(isJsx ? ["jsx"] : []),
      ],
    });
    return { ast, error: null };
  } catch (e) {
    return { ast: null, error: e instanceof Error ? e : new Error(String(e)) };
  }
}

module.exports = { parseJavaScript };
