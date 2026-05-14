/**
 * Modos de execução híbrida (Fase 4.9+). Read-only 4.9.1 não os usa ainda.
 */

const EXECUTION_MODE = Object.freeze({
  TEXTUAL: "textual",
  STRUCTURAL: "structural",
  HYBRID: "hybrid",
});

module.exports = { EXECUTION_MODE };
