/** Tipos MVP (Fase 4.9.2). */
const MVP_NODE_KINDS = new Set([
  "ImportDeclaration",
  "ExportNamedDeclaration",
  "VariableDeclaration",
  "FunctionDeclaration",
  "ClassDeclaration",
]);

/** @typedef {{ node: object, node_path_hint: string, node_kind: string }} MvpAstCandidate */

/**
 * @returns {MvpAstCandidate[]}
 */
function collectMvpStatementNodes(programBody) {
  /** @type {MvpAstCandidate[]} */
  const list = [];

  if (!Array.isArray(programBody)) return list;

  for (let i = 0; i < programBody.length; i++) {
    const stmt = programBody[i];
    const topPath = `program.body[${i}]`;

    if (stmt && MVP_NODE_KINDS.has(stmt.type)) {
      list.push({ node: stmt, node_path_hint: topPath, node_kind: stmt.type });
    }

    if (stmt && stmt.type === "ExportNamedDeclaration" && stmt.declaration) {
      const d = stmt.declaration;
      if (MVP_NODE_KINDS.has(d.type)) {
        list.push({
          node: d,
          node_path_hint: `program.body[${i}].declaration`,
          node_kind: d.type,
        });
      }
    }
  }

  return list;
}

/**
 * Nós MVP cuja régua UTF-16 [start,end) intersecta o trecho search.
 * @param {{ program?: { body?: object[] }}} ast
 * @param {number} searchStart
 * @param {number} searchEnd
 * @returns {MvpAstCandidate[]}
 */
function findOverlappingCandidates(ast, searchStart, searchEnd) {
  const file = ast && ast.type === "File" ? ast : null;
  const body =
    file && file.program && Array.isArray(file.program.body)
      ? file.program.body
      : ast && ast.type === "Program" && Array.isArray(ast.body)
        ? ast.body
        : null;

  if (body === null || searchEnd <= searchStart) return [];

  const flat = collectMvpStatementNodes(body);

  /** @type {MvpAstCandidate[]} */
  const overlaps = [];

  for (const c of flat) {
    const { node } = c;
    const ns = typeof node.start === "number" ? node.start : null;
    const ne = typeof node.end === "number" ? node.end : null;
    if (ns == null || ne == null || ne <= ns) continue;

    if (searchStart < ne && searchEnd > ns) {
      overlaps.push(c);
    }
  }

  overlaps.sort((a, b) => {
    const an = /** @type {any} */ (a.node);
    const bn = /** @type {any} */ (b.node);
    const spanA = (an.end ?? 0) - (an.start ?? 0);
    const spanB = (bn.end ?? 0) - (bn.start ?? 0);
    if (spanA !== spanB) return spanA - spanB;
    return String(a.node_kind).localeCompare(String(b.node_kind));
  });

  return overlaps;
}

module.exports = {
  MVP_NODE_KINDS,
  collectMvpStatementNodes,
  findOverlappingCandidates,
};
