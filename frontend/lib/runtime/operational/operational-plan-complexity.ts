import type { OperationalPlanComplexity } from "./operational-plan-types.ts";
import { defaultComplexityExplanation } from "./operational-plan-execution-level.ts";

const COMPLEXITY_LABEL_PT: Record<
  OperationalPlanComplexity["level"],
  string
> = { low: "Baixa", medium: "Média", high: "Alta" };

const COMPLEXITY_WORD_PT: Record<
  OperationalPlanComplexity["level"],
  string
> = { low: "baixa", medium: "média", high: "alta" };

/** Prefixo de frase completa legada — remover ao normalizar. */
const EVALUATED_PREFIX_RE =
  /^a\s+tarefa\s+foi\s+avaliada\s+como\s+(?:baixa|m[eé]dia|alta)\s+porque\s+/i;

export function extractComplexityReason(
  raw: string | null | undefined,
): string | null {
  let t = String(raw || "").trim();
  if (!t) return null;
  let prev: string;
  do {
    prev = t;
    t = t.replace(EVALUATED_PREFIX_RE, "").trim();
  } while (t !== prev && EVALUATED_PREFIX_RE.test(t));
  t = t.replace(/^porque\s+/i, "").trim();
  return t || null;
}

function defaultComplexityReason(
  level: OperationalPlanComplexity["level"],
): string {
  if (level === "low") return "escopo reduzido e entregas pontuais";
  if (level === "high") return "escopo amplo com várias frentes de trabalho";
  return "entregas coordenadas de complexidade moderada";
}

export function formatComplexitySentence(
  level: OperationalPlanComplexity["level"],
  reason: string | null | undefined,
  _levelLabelPt?: string | null,
): string {
  const word = COMPLEXITY_WORD_PT[level] || "média";
  const pure =
    extractComplexityReason(reason) ||
    (reason ? String(reason).trim() : null) ||
    defaultComplexityReason(level);
  let because = pure.charAt(0).toLowerCase() + pure.slice(1);
  because = because.replace(/[.!?]+\s*$/, "").trim();
  because = because.replace(/^porque\s+/i, "").trim();
  return `A tarefa foi avaliada como ${word} porque ${because}.`;
}

export function normalizeComplexityObject(
  complexity: OperationalPlanComplexity | null | undefined,
): OperationalPlanComplexity | null | undefined {
  if (!complexity || typeof complexity !== "object") {
    return complexity;
  }
  const level =
    complexity.level === "low" ||
    complexity.level === "medium" ||
    complexity.level === "high"
      ? complexity.level
      : "medium";
  const raw = complexity.reason ?? complexity.explanation;
  const reason =
    extractComplexityReason(raw) ||
    (raw ? String(raw).trim() : null) ||
    null;
  return {
    ...complexity,
    level,
    levelLabelPt:
      complexity.levelLabelPt || COMPLEXITY_LABEL_PT[level] || "Média",
    reason,
    explanation: reason,
  };
}

export function resolveComplexityReason(
  complexity: Pick<
    OperationalPlanComplexity,
    "level" | "reason" | "explanation"
  >,
): string {
  const raw = complexity.reason ?? complexity.explanation;
  const pure =
    extractComplexityReason(raw) || (raw ? String(raw).trim() : null);
  if (pure) return pure;
  return defaultComplexityExplanation(complexity.level);
}

export function formatOperationalPlanComplexitySentence(
  complexity: OperationalPlanComplexity,
): string {
  return formatComplexitySentence(
    complexity.level,
    resolveComplexityReason(complexity),
    complexity.levelLabelPt,
  );
}
