/**
 * Heurísticas leves sobre texto da task e paths (regex / keywords).
 */

const KW = {
  integration:
    /\b(integration|integração|integracao|webhook|oauth|stripe|payment|queue|kafka)\b/i,
  frontend:
    /\b(react|vue|svelte|component|ui|css|tailwind|frontend|front-end)\b/i,
  backend:
    /\b(api|backend|server|express|fastify|nestjs|route|controller|graphql)\b/i,
  database:
    /\b(database|db|postgres|mysql|mongo|prisma|migration|schema|sql)\b/i,
  security:
    /\b(auth|jwt|csrf|oauth|secret|password|permission|rbac|tenant|multi-tenant)\b/i,
  orchestration:
    /\b(orchestrat|pipeline|executor|runtime|dry-run|preflight|scan)\b/i,
  refactor:
    /\b(refactor|rewrite|migrate|large|massive|estrutura completa)\b/i,
  noop_docs:
    /\b(documentação|documentation|readme only|apenas doc)\b/i,
};

const PATH_HINTS = {
  runtime_core:
    /(scripts[/\\]runtime[/\\]|orchestration\.js|executor\.js|review\.js|correction\.js)/i,
  security_sensitive:
    /(\.env|secret|credential|auth\.|jwt)/i,
};

function scoreKeywords(taskLower) {
  const hits = {};
  let layers = 0;
  if (KW.frontend.test(taskLower)) {
    hits.frontend = true;
    layers++;
  }
  if (KW.backend.test(taskLower)) {
    hits.backend = true;
    layers++;
  }
  if (KW.database.test(taskLower)) {
    hits.database = true;
    layers++;
  }
  if (KW.orchestration.test(taskLower)) {
    hits.orchestration = true;
    layers++;
  }
  if (KW.integration.test(taskLower)) hits.integration = true;
  if (KW.security.test(taskLower)) hits.security = true;
  if (KW.refactor.test(taskLower)) hits.refactor = true;
  if (KW.noop_docs.test(taskLower)) hits.noop_docs = true;

  return { hits, layerCount: layers, crossLayer: layers >= 2 };
}

function extractPathHints(taskText) {
  const t = String(taskText || "");
  return {
    runtime_core: PATH_HINTS.runtime_core.test(t),
    security_sensitive: PATH_HINTS.security_sensitive.test(t),
  };
}

function classifyCorrectionProbability(scorePoints, histAvgCorr) {
  let p = scorePoints;
  if (Number.isFinite(histAvgCorr) && histAvgCorr > 1.2) p += 2;
  if (Number.isFinite(histAvgCorr) && histAvgCorr > 2) p += 2;

  if (p <= 2) return { label: "LOW", rationale: "task compacta / histórico estável" };
  if (p <= 5)
    return { label: "MODERATE", rationale: "sinais médios de iteração ou histórico misto" };
  if (p <= 8)
    return { label: "HIGH", rationale: "vários fatores indicam revisões frequentes" };
  return { label: "VERY_HIGH", rationale: "combinação de escopo largo + histórico rugoso" };
}

function classifyOperationalSeverity(complexityTier, riskTier) {
  const order = { LOW: 0, MEDIUM: 1, HIGH: 2, EXTREME: 3, CRITICAL: 3 };
  const c = order[complexityTier] ?? 1;
  const r =
    riskTier === "CRITICAL"
      ? 3
      : riskTier === "HIGH"
        ? 2
        : riskTier === "MEDIUM"
          ? 1
          : 0;
  const s = Math.min(3, Math.max(c, r));
  if (s <= 0) return "LOW";
  if (s === 1) return "MEDIUM";
  if (s === 2) return "HIGH";
  return "CRITICAL";
}

module.exports = {
  KW,
  scoreKeywords,
  extractPathHints,
  classifyCorrectionProbability,
  classifyOperationalSeverity,
};
