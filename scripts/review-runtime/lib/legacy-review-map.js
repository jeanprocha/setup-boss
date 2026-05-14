const ACCEPTANCE_LEVEL_ENUM = ["development", "staging", "production"];

function normalizeTaskAcceptanceLevel(token) {
  if (!token) return null;
  const x = String(token).toLowerCase();
  if (x === "development" || x === "dev") return "development";
  if (x === "staging" || x === "homologation" || x === "homolog" || x === "hmg") return "staging";
  if (x === "production" || x === "prod") return "production";
  return null;
}

function extractExpectedAcceptanceLevelFromRunContext(runContext) {
  const level =
    runContext &&
    runContext.task &&
    typeof runContext.task.acceptance_level === "string"
      ? runContext.task.acceptance_level
      : null;
  return normalizeTaskAcceptanceLevel(level);
}

function resolveAcceptanceLevelForReview(snapshot) {
  const rc = snapshot.run_context;
  const expected = extractExpectedAcceptanceLevelFromRunContext(rc);
  return expected && ACCEPTANCE_LEVEL_ENUM.includes(expected) ? expected : "development";
}

module.exports = {
  resolveAcceptanceLevelForReview,
  ACCEPTANCE_LEVEL_ENUM,
};
