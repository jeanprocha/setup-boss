/**
 * Classificação primary vs reference mantendo compatibilidade com allowed_files.
 * (Normalização local — evita ciclo com shared-utils → context-builder.)
 */
function normalizeRelativePath(filePath) {
  return String(filePath || "")
    .replace(/\\/g, "/")
    .replace(/^\.?\//, "")
    .trim();
}

function uniqueNormalizedPaths(paths) {
  return [
    ...new Set(
      (Array.isArray(paths) ? paths : [])
        .map(normalizeRelativePath)
        .filter(Boolean),
    ),
  ];
}

function extractPathArray(raw) {
  if (!Array.isArray(raw)) return [];
  return raw.map((x) => normalizeRelativePath(String(x || ""))).filter(Boolean);
}

/**
 * @param {string[]} allowedFiles
 * @param {object|null} architectDecision objeto JSON completo do architect (opcional)
 * @returns {{ primary_files: string[], reference_files: string[], source: string }}
 */
function classifyPrimaryReference(allowedFiles, architectDecision) {
  const allowed = uniqueNormalizedPaths(allowedFiles);
  const allowedSet = new Set(allowed);

  if (!architectDecision || typeof architectDecision !== "object") {
    return {
      primary_files: allowed.slice(),
      reference_files: [],
      source: "fallback_all_primary",
    };
  }

  let primary = extractPathArray(architectDecision.primary_files);
  let reference = extractPathArray(architectDecision.reference_files);

  primary = primary.filter((p) => allowedSet.has(p));
  reference = reference.filter((p) => allowedSet.has(p));

  const primarySetEarly = new Set(primary);
  reference = reference.filter((p) => !primarySetEarly.has(p));

  if (primary.length === 0 && reference.length === 0) {
    return {
      primary_files: allowed.slice(),
      reference_files: [],
      source: "fallback_all_primary",
    };
  }

  const covered = new Set([...primary, ...reference]);
  const orphanPrimary = allowed.filter((p) => !covered.has(p));

  const primary_files = uniqueNormalizedPaths([...primary, ...orphanPrimary]);
  const pref = new Set(primary_files);
  const reference_files = uniqueNormalizedPaths(reference).filter(
    (p) => !pref.has(p),
  );

  return {
    primary_files,
    reference_files,
    source: "architect_json_optional",
  };
}

function buildClassificationSets(classification) {
  const primary_files = classification.primary_files || [];
  const reference_files = classification.reference_files || [];
  return {
    primary_files,
    reference_files,
    primarySet: new Set(primary_files.map(normalizeRelativePath)),
    referenceSet: new Set(reference_files.map(normalizeRelativePath)),
  };
}

/** true = arquivo deve receber recorte/snippet maior (primário ou não classificado como reference-only). */
function isPrimaryLikePath(relPath, sets) {
  const p = normalizeRelativePath(relPath);
  if (sets.referenceSet.has(p) && !sets.primarySet.has(p)) return false;
  return true;
}

module.exports = {
  classifyPrimaryReference,
  buildClassificationSets,
  isPrimaryLikePath,
};
