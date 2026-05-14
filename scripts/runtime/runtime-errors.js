/**
 * Erros com semântica de encerramento controlado pelo chamador (CLI/daemon/API).
 * Não devem usar process.exit dentro do núcleo de runtime.
 */

class RuntimeTerminalError extends Error {
  /**
   * @param {string} message
   * @param {{
   *   code?: string,
   *   exitCode?: number,
   *   loggerHandled?: boolean,
   * }=} opts
   */
  constructor(message, opts = {}) {
    super(message);
    this.name = "RuntimeTerminalError";
    this.code = opts.code || "RUNTIME_TERMINAL";
    this.exitCode =
      typeof opts.exitCode === "number" && opts.exitCode >= 0 ? opts.exitCode : 1;
    this.loggerHandled = opts.loggerHandled === true;
  }
}

module.exports = {
  RuntimeTerminalError,
};
