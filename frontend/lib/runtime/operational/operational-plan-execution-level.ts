import type { IntakePriority } from "../intake/intake-types.ts";
import type { StrategyBundleDto } from "../strategy/strategy-types.ts";

/** Nível de intensidade de execução (compatível com metadata.priority legado). */
export type ExecutionLevelId = IntakePriority;

export type RecommendedModeId = StrategyBundleDto["recommendation"]["recommendedMode"];

export type ExecutionLevelDefinition = {
  id: ExecutionLevelId;
  mode: RecommendedModeId;
  labelPt: string;
  descriptionPt: string;
};

/** Texto introdutório do tooltip «Nível de execução». */
export const EXECUTION_LEVELS_HELP_INTRO_PT =
  "O nível de execução define quanta profundidade será aplicada durante análise, planejamento e validação da tarefa.";

export const EXECUTION_LEVELS: readonly ExecutionLevelDefinition[] = [
  {
    id: "low",
    mode: "basic",
    labelPt: "Econômico",
    descriptionPt:
      "Execução mais rápida e objetiva, ideal para tarefas simples e alterações menores.",
  },
  {
    id: "normal",
    mode: "standard",
    labelPt: "Padrão",
    descriptionPt:
      "Equilíbrio entre velocidade, contexto e qualidade. Recomendado para a maioria das tarefas.",
  },
  {
    id: "high",
    mode: "expert",
    labelPt: "Avançado",
    descriptionPt:
      "Maior profundidade de análise e validação, indicado para tarefas mais complexas ou críticas.",
  },
] as const;

export const COMPLEXITY_DEFAULT_EXPLANATIONS_PT: Record<
  "low" | "medium" | "high",
  string
> = {
  low: "Alteração localizada, sem impacto estrutural relevante.",
  medium:
    "Envolve múltiplos componentes e possíveis ajustes visuais compartilhados.",
  high: "Impacta múltiplos módulos, regras de negócio ou arquitetura do sistema.",
};

export function executionLevelFromMode(
  mode: RecommendedModeId | string | null | undefined,
): ExecutionLevelId {
  const m = String(mode || "").toLowerCase();
  if (m === "basic" || m === "low") return "low";
  if (m === "expert" || m === "high") return "high";
  return "normal";
}

export function modeFromExecutionLevel(
  level: ExecutionLevelId,
): RecommendedModeId {
  return EXECUTION_LEVELS.find((e) => e.id === level)?.mode ?? "standard";
}

export function executionLevelDefinition(
  level: ExecutionLevelId,
): ExecutionLevelDefinition {
  return (
    EXECUTION_LEVELS.find((e) => e.id === level) ??
    EXECUTION_LEVELS[1]
  );
}

export function defaultComplexityExplanation(
  level: "low" | "medium" | "high",
): string {
  return COMPLEXITY_DEFAULT_EXPLANATIONS_PT[level];
}
